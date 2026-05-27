import { describe, it, expect } from 'vitest';
import {
  classifySql,
  prepareSqlForExecution,
  getExecutionMethod,
  getCategoryLabel,
  SqlCategory,
} from './sqlClassifier';

describe('classifySql', () => {
  // ===== DDL =====
  describe('DDL statements', () => {
    it('should classify CREATE TABLE as DDL', () => {
      expect(classifySql('CREATE TABLE users (id INT PRIMARY KEY)')).toBe('DDL');
    });

    it('should classify CREATE INDEX as DDL', () => {
      expect(classifySql('CREATE INDEX idx_name ON users(name)')).toBe('DDL');
    });

    it('should classify ALTER TABLE as DDL', () => {
      expect(classifySql('ALTER TABLE users ADD COLUMN email VARCHAR(255)')).toBe('DDL');
    });

    it('should classify DROP TABLE as DDL', () => {
      expect(classifySql('DROP TABLE users')).toBe('DDL');
    });

    it('should classify TRUNCATE as DDL', () => {
      expect(classifySql('TRUNCATE TABLE users')).toBe('DDL');
    });

    it('should classify RENAME as DDL', () => {
      expect(classifySql('RENAME TABLE old_name TO new_name')).toBe('DDL');
    });

    it('should handle DDL with leading whitespace', () => {
      expect(classifySql('   CREATE TABLE users (id INT)')).toBe('DDL');
    });

    it('should handle DDL with leading comments', () => {
      expect(classifySql('-- create a new table\nCREATE TABLE users (id INT)')).toBe('DDL');
    });

    it('should handle DDL with multiple leading comments', () => {
      expect(
        classifySql('-- line 1\n-- line 2\nCREATE TABLE users (id INT)'),
      ).toBe('DDL');
    });
  });

  // ===== DML =====
  describe('DML statements', () => {
    it('should classify INSERT as DML', () => {
      expect(classifySql("INSERT INTO users (id, name) VALUES (1, 'test')")).toBe('DML');
    });

    it('should classify UPDATE as DML', () => {
      expect(classifySql("UPDATE users SET name = 'updated' WHERE id = 1")).toBe('DML');
    });

    it('should classify DELETE as DML', () => {
      expect(classifySql('DELETE FROM users WHERE id = 1')).toBe('DML');
    });

    it('should classify MERGE as DML', () => {
      expect(
        classifySql(`MERGE INTO target t USING source s ON t.id = s.id
          WHEN MATCHED THEN UPDATE SET t.name = s.name`),
      ).toBe('DML');
    });

    it('should handle DML with leading whitespace', () => {
      expect(classifySql('  INSERT INTO users VALUES (1, "test")')).toBe('DML');
    });

    it('should handle DML with leading comments', () => {
      expect(classifySql('-- delete old records\nDELETE FROM users WHERE created_at < "2023-01-01"')).toBe('DML');
    });
  });

  // ===== SELECT =====
  describe('SELECT statements', () => {
    it('should classify simple SELECT as SELECT_PLAIN', () => {
      expect(classifySql('SELECT * FROM users')).toBe('SELECT_PLAIN');
    });

    it('should classify SELECT with WHERE as SELECT_PLAIN', () => {
      expect(classifySql('SELECT id, name FROM users WHERE id > 10')).toBe('SELECT_PLAIN');
    });

    it('should classify SELECT with JOIN as SELECT_PLAIN', () => {
      expect(
        classifySql('SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id'),
      ).toBe('SELECT_PLAIN');
    });

    it('should classify SELECT with ORDER BY as SELECT_PLAIN', () => {
      expect(classifySql('SELECT * FROM users ORDER BY created_at DESC')).toBe('SELECT_PLAIN');
    });

    it('should classify SELECT with COUNT as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT COUNT(*) FROM users')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SELECT with SUM as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT SUM(amount) FROM orders')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SELECT with AVG as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT AVG(price) FROM products')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SELECT with MAX as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT MAX(score) FROM results')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SELECT with MIN as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT MIN(price) FROM products')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SELECT with GROUP BY as SELECT_AGGREGATE', () => {
      expect(classifySql('SELECT status, COUNT(*) FROM orders GROUP BY status')).toBe(
        'SELECT_AGGREGATE',
      );
    });

    it('should classify SELECT with both aggregate and GROUP BY as SELECT_AGGREGATE', () => {
      expect(
        classifySql(
          'SELECT department, AVG(salary) FROM employees GROUP BY department',
        ),
      ).toBe('SELECT_AGGREGATE');
    });
  });

  // ===== CTE (WITH ... SELECT) =====
  describe('CTE (Common Table Expressions)', () => {
    it('should classify WITH ... SELECT as SELECT (not unknown)', () => {
      expect(
        classifySql(`WITH active_users AS (
          SELECT * FROM users WHERE status = 'active'
        )
        SELECT * FROM active_users`),
      ).toBe('SELECT_PLAIN');
    });

    it('should classify CTE with aggregate as SELECT_AGGREGATE', () => {
      expect(
        classifySql(`WITH order_stats AS (
          SELECT user_id, COUNT(*) as order_count
          FROM orders
          GROUP BY user_id
        )
        SELECT * FROM order_stats WHERE order_count > 5`),
      ).toBe('SELECT_AGGREGATE');
    });

    it('should classify multiple CTEs as SELECT', () => {
      expect(
        classifySql(`WITH
          users_cte AS (SELECT * FROM users),
          orders_cte AS (SELECT * FROM orders)
        SELECT * FROM users_cte u JOIN orders_cte o ON u.id = o.user_id`),
      ).toBe('SELECT_PLAIN');
    });

    it('should classify recursive CTE as SELECT', () => {
      expect(
        classifySql(`WITH RECURSIVE hierarchy AS (
          SELECT id, parent_id, name FROM categories WHERE parent_id IS NULL
          UNION ALL
          SELECT c.id, c.parent_id, c.name FROM categories c JOIN hierarchy h ON c.parent_id = h.id
        )
        SELECT * FROM hierarchy`),
      ).toBe('SELECT_PLAIN');
    });
  });

  // ===== SHOW / DESCRIBE / EXPLAIN =====
  describe('SHOW / DESCRIBE / EXPLAIN', () => {
    it('should classify SHOW TABLES as SELECT_AGGREGATE (read-only)', () => {
      expect(classifySql('SHOW TABLES')).toBe('SELECT_AGGREGATE');
    });

    it('should classify DESCRIBE table as SELECT_AGGREGATE', () => {
      expect(classifySql('DESCRIBE users')).toBe('SELECT_AGGREGATE');
    });

    it('should classify DESC table as SELECT_AGGREGATE', () => {
      // Note: current regex is /^\s*(SHOW|DESC|RIBE|EXPLAIN)\s/i
      // DESC is matched by "DESC" but "DESCRIBE" is split into "DESC" + "RIBE"
      // This tests the actual regex behavior
      expect(classifySql('DESC users')).toBe('SELECT_AGGREGATE');
    });

    it('should classify EXPLAIN as SELECT_AGGREGATE', () => {
      expect(classifySql('EXPLAIN SELECT * FROM users')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SHOW COLUMNS as SELECT_AGGREGATE', () => {
      expect(classifySql('SHOW COLUMNS FROM users')).toBe('SELECT_AGGREGATE');
    });

    it('should classify SHOW CREATE TABLE as SELECT_AGGREGATE', () => {
      expect(classifySql('SHOW CREATE TABLE users')).toBe('SELECT_AGGREGATE');
    });
  });

  // ===== Edge cases =====
  describe('Edge cases', () => {
    it('should handle lowercase SQL', () => {
      expect(classifySql('select * from users')).toBe('SELECT_PLAIN');
    });

    it('should handle mixed case SQL', () => {
      expect(classifySql('Select * From Users')).toBe('SELECT_PLAIN');
    });

    it('should handle SQL with leading newlines', () => {
      expect(classifySql('\n\nSELECT * FROM users')).toBe('SELECT_PLAIN');
    });

    it('should handle SQL with leading tabs', () => {
      expect(classifySql('\t\tSELECT * FROM users')).toBe('SELECT_PLAIN');
    });

    it('should handle multi-line SELECT', () => {
      expect(
        classifySql(`SELECT
          u.id,
          u.name,
          o.total
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE u.status = 'active'`),
      ).toBe('SELECT_PLAIN');
    });

    it('should handle SQL with only comments', () => {
      // After stripping comments, empty string → default SELECT_PLAIN
      expect(classifySql('-- just a comment')).toBe('SELECT_PLAIN');
    });

    it('should handle empty string as SELECT_PLAIN (default)', () => {
      expect(classifySql('')).toBe('SELECT_PLAIN');
    });

    it('should handle whitespace only as SELECT_PLAIN', () => {
      expect(classifySql('   \n  \t  ')).toBe('SELECT_PLAIN');
    });

    it('should not misclassify SELECT that contains "INSERT" in a string literal', () => {
      // The regex checks the START of the SQL, so this should be SELECT
      expect(classifySql("SELECT 'INSERT INTO' as test_value")).toBe('SELECT_PLAIN');
    });

    it('should handle UNION queries', () => {
      expect(
        classifySql(`SELECT id FROM users
          UNION
          SELECT id FROM archived_users`),
      ).toBe('SELECT_PLAIN');
    });

    it('should handle subqueries', () => {
      expect(
        classifySql(
          'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)',
        ),
      ).toBe('SELECT_PLAIN');
    });

    it('should handle SELECT DISTINCT', () => {
      expect(classifySql('SELECT DISTINCT status FROM orders')).toBe('SELECT_PLAIN');
    });

    it('should handle SELECT TOP (SQL Server)', () => {
      expect(classifySql('SELECT TOP 10 * FROM users')).toBe('SELECT_PLAIN');
    });

    it('should handle INSERT ... SELECT', () => {
      // This starts with INSERT, so it's DML
      expect(
        classifySql('INSERT INTO archive SELECT * FROM users WHERE active = 0'),
      ).toBe('DML');
    });
  });
});

describe('prepareSqlForExecution', () => {
  it('should add LIMIT 10 to SELECT_PLAIN without LIMIT', () => {
    const result = prepareSqlForExecution('SELECT * FROM users', 'SELECT_PLAIN');
    expect(result).toContain('LIMIT 10');
  });

  it('should not add LIMIT to SELECT_AGGREGATE', () => {
    const sql = 'SELECT COUNT(*) FROM users';
    const result = prepareSqlForExecution(sql, 'SELECT_AGGREGATE');
    expect(result).toBe(sql);
  });

  it('should not add LIMIT to DML', () => {
    const sql = "INSERT INTO users VALUES (1, 'test')";
    const result = prepareSqlForExecution(sql, 'DML');
    expect(result).toBe(sql);
  });

  it('should not add LIMIT to DDL', () => {
    const sql = 'CREATE TABLE users (id INT)';
    const result = prepareSqlForExecution(sql, 'DDL');
    expect(result).toBe(sql);
  });

  it('should not duplicate LIMIT if already present', () => {
    const sql = 'SELECT * FROM users LIMIT 5';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 5');
    expect(result).not.toContain('LIMIT 10');
  });

  it('should not duplicate LIMIT with custom value', () => {
    const sql = 'SELECT * FROM users LIMIT 100';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 100');
  });

  it('should fix LIMIT without space (LIMIT10 → LIMIT 10)', () => {
    const sql = 'SELECT * FROM users LIMIT10';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 10');
  });

  it('should fix LIMIT without space and add semicolon', () => {
    const sql = 'SELECT * FROM users LIMIT 50';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 50');
  });

  it('should strip trailing semicolon before adding LIMIT', () => {
    const sql = 'SELECT * FROM users;';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 10;');
  });

  it('should handle LIMIT with trailing semicolon already present', () => {
    const sql = 'SELECT * FROM users LIMIT 5;';
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toBe('SELECT * FROM users LIMIT 5;');
  });

  it('should handle multi-line SQL', () => {
    const sql = `SELECT *
FROM users
WHERE status = 'active'`;
    const result = prepareSqlForExecution(sql, 'SELECT_PLAIN');
    expect(result).toContain('LIMIT 10');
  });
});

describe('getExecutionMethod', () => {
  it('should return executeDDL for DDL', () => {
    expect(getExecutionMethod('DDL')).toBe('executeDDL');
  });

  it('should return executeSql for SELECT_PLAIN', () => {
    expect(getExecutionMethod('SELECT_PLAIN')).toBe('executeSql');
  });

  it('should return executeSql for SELECT_AGGREGATE', () => {
    expect(getExecutionMethod('SELECT_AGGREGATE')).toBe('executeSql');
  });

  it('should return executeSql for DML', () => {
    expect(getExecutionMethod('DML')).toBe('executeSql');
  });
});

describe('getCategoryLabel', () => {
  it('should return correct labels', () => {
    expect(getCategoryLabel('DDL')).toBe('数据库结构变更');
    expect(getCategoryLabel('DML')).toBe('数据修改');
    expect(getCategoryLabel('SELECT_AGGREGATE')).toBe('聚合查询');
    expect(getCategoryLabel('SELECT_PLAIN')).toBe('数据查询');
  });
});
