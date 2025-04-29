#include <iostream>
#include <vector>
#include <cmath>
#include <chrono>
#include <iomanip>

using namespace std;
using namespace std::chrono;

const double EPS = 1e-15;

// Класс для работы с векторами
class Vector {
public:
    vector<double> data;
    int size;

    Vector(int n) : size(n), data(n, 0.0) {}

    double norm() const {
        double sum = 0.0;
        for (double val : data) {
            sum += val * val;
        }
        return sqrt(sum);
    }

    Vector operator-(const Vector& other) const {
        Vector result(size);
        for (int i = 0; i < size; ++i) {
            result.data[i] = data[i] - other.data[i];
        }
        return result;
    }
};

// Класс для работы с матрицами
class Matrix {
public:
    vector<vector<double>> data;
    int rows, cols;

    Matrix(int m, int n) : rows(m), cols(n), data(m, vector<double>(n, 0.0)) {}

    Vector operator*(const Vector& vec) const {
        Vector result(rows);
        for (int i = 0; i < rows; ++i) {
            for (int j = 0; j < cols; ++j) {
                result.data[i] += data[i][j] * vec.data[j];
            }
        }
        return result;
    }
};

// Метод Гаусса с выбором ведущего элемента
Vector gaussWithPivoting(Matrix A, Vector F) {
    int n = A.rows;
    Vector X(n);

    // Прямой ход
    for (int k = 0; k < n; ++k) {
        // Поиск ведущего элемента
        int max_row = k;
        double max_val = abs(A.data[k][k]);
        for (int i = k + 1; i < n; ++i) {
            if (abs(A.data[i][k]) > max_val) {
                max_val = abs(A.data[i][k]);
                max_row = i;
            }
        }

        // Перестановка строк
        if (max_row != k) {
            swap(A.data[k], A.data[max_row]);
            swap(F.data[k], F.data[max_row]);
        }

        // Исключение
        for (int i = k + 1; i < n; ++i) {
            double factor = A.data[i][k] / A.data[k][k];
            for (int j = k; j < n; ++j) {
                A.data[i][j] -= factor * A.data[k][j];
            }
            F.data[i] -= factor * F.data[k];
        }
    }

    // Обратный ход
    for (int i = n - 1; i >= 0; --i) {
        X.data[i] = F.data[i];
        for (int j = i + 1; j < n; ++j) {
            X.data[i] -= A.data[i][j] * X.data[j];
        }
        X.data[i] /= A.data[i][i];
    }

    return X;
}

// QR-разложение с вращениями Гивенса
void givensRotation(Matrix& A, Matrix& Q, Matrix& R, int i, int j, int k) {
    double a = R.data[i][k];
    double b = R.data[j][k];
    double r = sqrt(a * a + b * b);
    double c = a / r;
    double s = -b / r;

    for (int l = k; l < A.cols; ++l) {
        double temp = R.data[i][l];
        R.data[i][l] = c * R.data[i][l] - s * R.data[j][l];
        R.data[j][l] = s * temp + c * R.data[j][l];
    }

    for (int l = 0; l < A.rows; ++l) {
        double temp = Q.data[l][i];
        Q.data[l][i] = c * Q.data[l][i] - s * Q.data[l][j];
        Q.data[l][j] = s * temp + c * Q.data[l][j];
    }
}

void qrDecomposition(Matrix& A, Matrix& Q, Matrix& R) {
    int n = A.rows;
    Q = Matrix(n, n);
    R = A;

    // Инициализация Q как единичной матрицы
    for (int i = 0; i < n; ++i) {
        Q.data[i][i] = 1.0;
    }

    // Приведение R к верхнетреугольному виду
    for (int k = 0; k < n; ++k) {
        for (int j = k + 1; j < n; ++j) {
            if (abs(R.data[j][k]) > EPS) {
                givensRotation(A, Q, R, k, j, k);
            }
        }
    }
}

Vector solveQR(Matrix A, Vector F) {
    int n = A.rows;
    Matrix Q(n, n), R(n, n);
    qrDecomposition(A, Q, R);

    // Решение системы R*x = Q^T * F
    Vector QT_F(n);
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            QT_F.data[i] += Q.data[j][i] * F.data[j];
        }
    }

    Vector X(n);
    for (int i = n - 1; i >= 0; --i) {
        X.data[i] = QT_F.data[i];
        for (int j = i + 1; j < n; ++j) {
            X.data[i] -= R.data[i][j] * X.data[j];
        }
        X.data[i] /= R.data[i][i];
    }

    return X;
}

int main() {
    setlocale(0, "");
    vector<int> sizes = {250};

    for (int N : sizes) {
        cout << "N = " << N << ":\n\n";

        // Формирование матрицы A и вектора X_true
        Matrix A(N, N);
        Vector X_true(N);
        for (int i = 0; i < N; ++i) {
            for (int j = 0; j < N; ++j) {
                if (i == j) {
                    A.data[i][j] = 100.0;
                }
                else {
                    A.data[i][j] = 0.1 + 0.01 * (i + 1) - (j + 1);
                }
            }
            X_true.data[i] = 1.0;
        }

        // Формирование вектора правой части F = A * X_true
        Vector F = A * X_true;

        // Метод Гаусса с выбором ведущего элемента
        auto start_gauss = high_resolution_clock::now();
        Vector X_gauss = gaussWithPivoting(A, F);
        auto end_gauss = high_resolution_clock::now();
        auto duration_gauss = duration_cast<milliseconds>(end_gauss - start_gauss);

        Vector diff_gauss = X_gauss - X_true;
        double error_gauss = diff_gauss.norm() / X_true.norm();

        cout << "Метод Гаусса с ведущим элементом: " << endl;
        cout << "Время выполнения: " << duration_gauss.count() << " мкс" << endl;
        cout << "Погрешность: " << scientific << setprecision(8) << error_gauss << ":\n\n";

        // QR-разложение с вращениями Гивенса
        auto start_qr = high_resolution_clock::now();
        Vector X_qr = solveQR(A, F);
        auto end_qr = high_resolution_clock::now();
        auto duration_qr = duration_cast<milliseconds>(end_qr - start_qr);

        Vector diff_qr = X_qr - X_true;
        double error_qr = diff_qr.norm() / X_true.norm();

        cout << "QR-разложение на базе вращений Гивенса: " << endl;
        cout << "Время выполнения: " << duration_qr.count() << " мкс" << endl;
        cout << "Погрешность: " << scientific << setprecision(8) << error_qr << endl;
    }

    return 0;
}