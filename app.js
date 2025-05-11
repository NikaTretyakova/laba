const { Pool } = require("pg");
const express = require('express');
const path = require('path');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = 80;

const pool = new Pool({
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'db',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'qwerty',
    port: process.env.DB_PORT || 5432
});

// Проверка подключения к базе данных
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Database connection error:', err.stack);
    }
    console.log('Successful connection to the database');
    release();
});

// Middleware для проверки авторизации
const checkAuth = (req, res, next) => {
    if (!req.query.login || !req.query.password) {
        return res.sendStatus(403);
    }
    next();
};

// Middleware для проверки прав администратора/библиотекаря
const checkAdmin = (req, res, next) => {
    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2 AND (status = 'admin' OR status = 'librarian')",
        [req.query.login, req.query.password],
        (err, result) => {
            if (err || result.rowCount === 0) {
                return res.sendStatus(403);
            }
            req.user = result.rows[0];
            next();
        }
    );
};

// Главная страница
app.get("/", (req, res) => {
    if (req.query.login && req.query.password) {
        pool.query(
            // Авторизация пользователя:
            "SELECT * FROM readers WHERE login = $1 AND password = $2",
            [req.query.login, req.query.password],
            (err, user_data) => {
                if (err) return console.error(err);
                if (user_data.rowCount == 0) {
                    return res.render("index");
                }
                //Обновление времени последнего посещения
                pool.query(
                    "UPDATE readers SET last_visit = $1 WHERE idr = $2",
                    [new Date().toISOString().slice(0, 19).replace('T', ' '), user_data.rows[0].idr],
                    (err) => { if (err) console.error(err); }
                );

                const render_options = { user: user_data.rows[0] };

                //Получение списка книг
                pool.query(
                    `SELECT books.idb, books.title, books.author, books.added_date, books.status_b AS status, 
                    readers.login AS reader_name, books.reader_id 
                    FROM books LEFT JOIN readers ON books.reader_id = readers.idr`,
                    [],
                    (err, books_data) => {
                        if (err) return console.error(err);

                        books_data.rows.forEach(book => {
                            book.editable = (
                                user_data.rows[0].status === 'admin' ||
                                user_data.rows[0].status === 'librarian' ||
                                (book.reader_id && book.reader_id === user_data.rows[0].idr)
                            );
                        });

                        render_options.books = books_data.rows;

                        if (user_data.rows[0].status === 'admin' || user_data.rows[0].status === 'librarian' || user_data.rows[0].status === 'reader') {
                            //Получение списка читателей
                            pool.query(
                                "SELECT * FROM readers",
                                [],
                                (err, readers_data) => {
                                    if (err) return console.error(err);
                                    render_options.readers = readers_data.rows.map(reader => ({
                                        ...reader,
                                        editable: user_data.rows[0].status === 'admin'
                                    }));
                                    res.render('lists', render_options);
                                }
                            );
                        } else {
                            render_options.readers = []; 
                            res.render('lists', render_options);
                        }
                    }
                );
            }
        );
    } else {
        res.render("index");
    }
});

// Регистрация
app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", (req, res) => {
    if (!req.body) return res.sendStatus(400);

    const current_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    pool.query(
        // Регистрация нового пользователя
        "INSERT INTO readers (login, password, first_name, last_name, patronymic, registration_date, last_visit, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
            req.body.login,
            req.body.password,
            req.body.first_name,
            req.body.last_name,
            req.body.patronymic,
            current_date,
            current_date,
            'reader'
        ],
        (err) => {
            if (err) {
                console.error(err);
                return res.sendStatus(403);
            }
            res.redirect(`/?login=${req.body.login}&password=${req.body.password}`);
        }
    );
});

// Добавление книги
app.get("/add-book", checkAuth, (req, res) => {
    res.render("addbook");
});

app.post("/add-book", checkAuth, (req, res) => {
    if (!req.body) return res.sendStatus(400);

    const { login, password } = req.query;

    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2",
        [login, password],
        (err, user_result) => {
            if (err || user_result.rowCount === 0) {
                return res.sendStatus(403);
            }

            const currentUser = user_result.rows[0];

    
            pool.query(
                "INSERT INTO books (title, author, added_date, status_b, reader_id) VALUES ($1, $2, $3, $4, $5)",
                [
                    req.body.title,
                    req.body.author,
                    new Date().toISOString().slice(0, 19).replace('T', ' '),
                    'available',
                    currentUser.status === 'admin' || currentUser.status === 'librarian' ? null : currentUser.idr
                ],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }
                    res.redirect(`/lists?login=${login}&password=${password}`);
                }
            );
        }
    );
});

// Редактирование читателя
app.get("/editreader/:id", checkAuth, (req, res) => {
    const { login, password } = req.query;

    // Получаем текущего пользователя
    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2",
        [login, password],
        (err, user_result) => {
            if (err || user_result.rowCount === 0) {
                return res.sendStatus(403);
            }

            const currentUser = user_result.rows[0];

            // Получаем пользователя, которого нужно редактировать
            pool.query(
                "SELECT * FROM readers WHERE idr = $1",
                [req.params.id],
                (err, reader_result) => {
                    if (err || reader_result.rowCount === 0) {
                        return res.sendStatus(404);
                    }

                    const targetReader = reader_result.rows[0];

                    // Проверка: можно редактировать только самого себя или, если ты админ
                    const isEditable =
                        currentUser.status === 'admin' ||
                        currentUser.idr === targetReader.idr;

                    if (!isEditable) return res.sendStatus(403);

                    res.render("editreader", {
                        ...targetReader,
                        query: req.query
                    });
                }
            );
        }
    );
});

app.post("/editreader/:id", checkAuth, (req, res) => {
    const { login, password } = req.query;
    const { first_name, last_name, patronymic } = req.body;

    // Получаем текущего пользователя
    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2",
        [login, password],
        (err, user_result) => {
            if (err || user_result.rowCount === 0) {
                return res.sendStatus(403);
            }

            const currentUser = user_result.rows[0];

            // Проверка, можно ли редактировать указанного читателя
            const editable = currentUser.status === 'admin' || currentUser.idr === parseInt(req.params.id);

            if (!editable) return res.sendStatus(403);

            pool.query(
                // Обновление данных пользователя
                "UPDATE readers SET first_name = $1, last_name = $2, patronymic = $3 WHERE idr = $4",
                [first_name, last_name, patronymic, req.params.id],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }
                    res.redirect(`/lists?login=${login}&password=${password}`);
                }
            );
        }
    );
});

// Удаление книги
app.delete("/deletebook", checkAuth, (req, res) => {
    const { login, password } = req.query;
    const bookId = req.body.id;

    if (!bookId) return res.sendStatus(400);

    // Получаем текущего пользователя
    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2",
        [login, password],
        (err, user_result) => {
            if (err || user_result.rowCount === 0) {
                return res.sendStatus(403);
            }

            const currentUser = user_result.rows[0];

            // Получаем книгу
            pool.query(
                "SELECT * FROM books WHERE idb = $1",
                [bookId],
                (err, book_result) => {
                    if (err || book_result.rowCount === 0) {
                        return res.sendStatus(404);
                    }

                    const book = book_result.rows[0];

                    const canDelete =
                        currentUser.status === 'admin' ||
                        currentUser.status === 'librarian' ||
                        (book.reader_id && book.reader_id === currentUser.idr);

                    if (!canDelete) {
                        return res.sendStatus(403);
                    }

                    pool.query(
                        "DELETE FROM books WHERE idb = $1",
                        [bookId],
                        (err) => {
                            if (err) {
                                console.error(err);
                                return res.sendStatus(500);
                            }
                            res.sendStatus(200);
                        }
                    );
                }
            );
        }
    );
});

// Удаление читателя
app.delete("/deletereader", checkAuth, (req, res) => {
    const { login, password } = req.query;
    const targetId = req.body.id;

    if (!targetId) return res.sendStatus(400);

    // Получаем текущего пользователя
    pool.query(
        "SELECT * FROM readers WHERE login = $1 AND password = $2",
        [login, password],
        (err, user_result) => {
            if (err || user_result.rowCount === 0) {
                return res.sendStatus(403);
            }

            const currentUser = user_result.rows[0];

            // Разрешено только админу или если пользователь удаляет сам себя
            if (currentUser.status !== 'admin' && currentUser.idr !== parseInt(targetId)) {
                return res.sendStatus(403);
            }

            pool.query(
                "DELETE FROM readers WHERE idr = $1",
                [targetId],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }
                    res.sendStatus(200);
                }
            );
        }
    );
});

// Выдача книги
app.post("/assign-book", checkAuth, checkAdmin, (req, res) => {
    if (!req.body.book_id || !req.body.reader_id) {
        return res.sendStatus(400);
    }

    pool.query(
        "UPDATE books SET reader_id = $1, status_b = 'Взята' WHERE idb = $2",
        [req.body.reader_id, req.body.book_id],
        (err) => {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }
            res.redirect(`/lists?login=${req.query.login}&password=${req.query.password}`);
        }
    );
});

// Запуск сервера
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});