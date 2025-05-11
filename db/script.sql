CREATE TABLE IF NOT EXISTS readers (
    idr SERIAL PRIMARY KEY,
    login VARCHAR(30) UNIQUE,
    password VARCHAR(30),
    last_name VARCHAR(30),
    first_name VARCHAR(30),
    patronymic VARCHAR(30),
    registration_date TIMESTAMP,
    last_visit TIMESTAMP,
    status VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS books (
    idb SERIAL PRIMARY KEY,
    title TEXT,
    author VARCHAR(50),
    reader_id INT,  -- если книга выдана читателю
    FOREIGN KEY (reader_id) REFERENCES readers(idr) ON DELETE CASCADE,
    added_date TIMESTAMP,
    status_b VARCHAR(30)  -- 'available', 'borrowed', 'lost'
);

INSERT INTO readers (login, password, first_name, status)
VALUES ('admin', 'qwerty', 'Superuser', 'admin');
