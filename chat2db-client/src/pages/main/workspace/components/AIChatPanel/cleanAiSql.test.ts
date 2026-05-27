import { describe, it, expect } from 'vitest';

/**
 * Replicate cleanAiSql from AIChatPanel/index.tsx for testing.
 * The original is not exported so we test the same logic here.
 */
function cleanAiSql(raw: string): string {
  return raw
    .replace(/^```(?:sql)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/(^|\s)(SELECT|FROM|WHERE|LIMIT|OFFSET|FETCH|HAVING|UNION|VALUES|SET|INTO|JOIN|EXISTS|DISTINCT)([^a-zA-Z_\s])/gim, '$1$2 $3')
    .replace(/(^|\s)(GROUP)(BY)([^a-zA-Z_])/gim, '$1$2 $3$4')
    .replace(/(^|\s)(ORDER)(BY)([^a-zA-Z_])/gim, '$1$2 $3$4')
    .replace(/(^|\s)(INSERT)(INTO)([^a-zA-Z_])/gim, '$1$2 $3$4')
    .replace(/(^|\s)(DELETE)(FROM)([^a-zA-Z_])/gim, '$1$2 $3$4')
    .trim();
}

describe('cleanAiSql', () => {
  describe('markdown fence removal', () => {
    it('should remove ```sql prefix', () => {
      expect(cleanAiSql('```sql\nSELECT * FROM users')).toBe('SELECT * FROM users');
    });

    it('should remove ``` prefix (without language tag)', () => {
      expect(cleanAiSql('```\nSELECT * FROM users')).toBe('SELECT * FROM users');
    });

    it('should remove trailing ```', () => {
      expect(cleanAiSql('SELECT * FROM users\n```')).toBe('SELECT * FROM users');
    });

    it('should remove both prefix and suffix fences', () => {
      expect(cleanAiSql('```sql\nSELECT * FROM users\n```')).toBe(
        'SELECT * FROM users',
      );
    });

    it('should handle ```SQL (uppercase)', () => {
      expect(cleanAiSql('```SQL\nSELECT * FROM users\n```')).toBe(
        'SELECT * FROM users',
      );
    });

    it('should handle ```Sql (mixed case)', () => {
      expect(cleanAiSql('```Sql\nSELECT * FROM users\n```')).toBe(
        'SELECT * FROM users',
      );
    });

    it('should not modify SQL without fences', () => {
      expect(cleanAiSql('SELECT * FROM users')).toBe('SELECT * FROM users');
    });

    it('should handle empty string', () => {
      expect(cleanAiSql('')).toBe('');
    });

    it('should handle only fences', () => {
      expect(cleanAiSql('```sql\n```')).toBe('');
    });
  });

  describe('keyword space fixing (non-letter following)', () => {
    it('should fix SELECT*', () => {
      expect(cleanAiSql('SELECT* FROM users')).toBe('SELECT * FROM users');
    });

    it('should fix LIMIT10', () => {
      expect(cleanAiSql('SELECT * FROM users LIMIT10')).toBe(
        'SELECT * FROM users LIMIT 10',
      );
    });

    it('should fix VALUES(', () => {
      expect(cleanAiSql("INSERT INTO users VALUES(1, 'test')")).toBe(
        "INSERT INTO users VALUES (1, 'test')",
      );
    });

    it('should fix FROM(', () => {
      // e.g. subquery: FROM(SELECT ...)
      expect(cleanAiSql('SELECT * FROM(SELECT id FROM users)')).toBe(
        'SELECT * FROM (SELECT id FROM users)',
      );
    });

    it('should fix WHERE(', () => {
      expect(cleanAiSql('SELECT * FROM users WHERE(1=1)')).toBe(
        'SELECT * FROM users WHERE (1=1)',
      );
    });

    it('should fix SET(', () => {
      // Unlikely but possible
      expect(cleanAiSql("UPDATE users SET(name) = ('test')")).toBe(
        "UPDATE users SET (name) = ('test')",
      );
    });

    it('should fix JOIN(', () => {
      // e.g. JOIN(subquery)
      expect(cleanAiSql('SELECT * FROM users JOIN(SELECT id FROM orders) o ON users.id = o.id')).toBe(
        'SELECT * FROM users JOIN (SELECT id FROM orders) o ON users.id = o.id',
      );
    });

    it('should not add extra space when space already exists', () => {
      expect(cleanAiSql('SELECT * FROM users')).toBe('SELECT * FROM users');
    });
  });

  describe('compound keyword fixing', () => {
    it('should fix GROUPBY → GROUP BY', () => {
      expect(cleanAiSql('SELECT COUNT(*) FROM users GROUPBY status')).toBe(
        'SELECT COUNT(*) FROM users GROUP BY status',
      );
    });

    it('should fix ORDERBY → ORDER BY', () => {
      expect(cleanAiSql('SELECT * FROM users ORDERBY name')).toBe(
        'SELECT * FROM users ORDER BY name',
      );
    });

    it('should fix INSERTINTO → INSERT INTO', () => {
      expect(cleanAiSql('INSERTINTO users VALUES (1, 2)')).toBe(
        'INSERT INTO users VALUES (1, 2)',
      );
    });

    it('should fix DELETEFROM → DELETE FROM', () => {
      expect(cleanAiSql('DELETEFROM users WHERE id = 1')).toBe(
        'DELETE FROM users WHERE id = 1',
      );
    });

    it('should not break "orders" table name', () => {
      // "orders" starts with "ORDER" but is NOT followed by "BY"
      expect(cleanAiSql('SELECT * FROM orders')).toBe('SELECT * FROM orders');
    });

    it('should not break "insert_id" column name', () => {
      expect(cleanAiSql('SELECT insert_id FROM logs')).toBe('SELECT insert_id FROM logs');
    });
  });

  describe('safety — should NOT break valid SQL', () => {
    it('should not modify table names that contain keyword prefixes', () => {
      expect(cleanAiSql('SELECT * FROM users')).toBe('SELECT * FROM users');
    });

    it('should not modify "orders" table', () => {
      expect(cleanAiSql('SELECT * FROM orders WHERE id = 1')).toBe(
        'SELECT * FROM orders WHERE id = 1',
      );
    });

    it('should not modify "insert_log" table', () => {
      expect(cleanAiSql('SELECT * FROM insert_log')).toBe('SELECT * FROM insert_log');
    });

    it('should not modify "setting" table', () => {
      expect(cleanAiSql('SELECT * FROM setting')).toBe('SELECT * FROM setting');
    });

    it('should not modify "system_settings" table', () => {
      expect(cleanAiSql('SELECT * FROM system_settings')).toBe(
        'SELECT * FROM system_settings',
      );
    });

    it('should not modify "in_progress" column', () => {
      expect(cleanAiSql("SELECT in_progress FROM tasks")).toBe(
        "SELECT in_progress FROM tasks",
      );
    });

    it('should not modify valid multi-line SQL', () => {
      const sql = `SELECT
  u.id,
  u.name,
  COUNT(o.id) AS order_count
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 10`;
      expect(cleanAiSql(sql)).toBe(sql);
    });
  });

  describe('combined scenarios (typical AI output)', () => {
    it('should clean ```sql fence + SELECT*', () => {
      const input = '```sql\nSELECT* FROM users WHERE status = "active" LIMIT10\n```';
      expect(cleanAiSql(input)).toBe(
        'SELECT * FROM users WHERE status = "active" LIMIT 10',
      );
    });

    it('should handle AI response with explanation text before SQL', () => {
      const input = 'Here is your SQL:\n```sql\nSELECT * FROM users\n```';
      const result = cleanAiSql(input);
      expect(result).toContain('Here is your SQL:');
      expect(result).toContain('SELECT * FROM users');
    });

    it('should handle AI response with only backtick fences', () => {
      const input = '```\nSELECT id, name FROM users WHERE id > 10\n```';
      expect(cleanAiSql(input)).toBe('SELECT id, name FROM users WHERE id > 10');
    });

    it('should preserve correct SQL with LIMIT already having space', () => {
      const input = 'SELECT * FROM users LIMIT 5';
      expect(cleanAiSql(input)).toBe('SELECT * FROM users LIMIT 5');
    });
  });
});

describe('SSE response accumulation logic', () => {
  function accumulateContent(previous: string, newContent: string): string {
    if (!previous || newContent.startsWith(previous)) {
      return newContent;
    }
    return previous + newContent;
  }

  describe('cumulative responses', () => {
    it('should replace when new content starts with previous', () => {
      const prev = 'SELECT *';
      const newChunk = 'SELECT * FROM users';
      expect(accumulateContent(prev, newChunk)).toBe('SELECT * FROM users');
    });

    it('should handle first chunk (no previous)', () => {
      expect(accumulateContent('', 'SELECT')).toBe('SELECT');
    });

    it('should progressively build up', () => {
      let acc = '';
      acc = accumulateContent(acc, 'SELECT');
      acc = accumulateContent(acc, 'SELECT * FROM');
      acc = accumulateContent(acc, 'SELECT * FROM users');
      expect(acc).toBe('SELECT * FROM users');
    });
  });

  describe('incremental (delta) responses', () => {
    it('should append when new content does not start with previous', () => {
      const prev = 'SELECT *';
      const delta = ' FROM users';
      expect(accumulateContent(prev, delta)).toBe('SELECT * FROM users');
    });

    it('should build incrementally', () => {
      let acc = '';
      acc = accumulateContent(acc, 'SELECT');
      acc = accumulateContent(acc, ' *');
      acc = accumulateContent(acc, ' FROM');
      acc = accumulateContent(acc, ' users');
      expect(acc).toBe('SELECT * FROM users');
    });
  });

  describe('edge cases', () => {
    it('should handle empty previous with empty new content', () => {
      expect(accumulateContent('', '')).toBe('');
    });

    it('should handle non-empty previous with empty new content', () => {
      expect(accumulateContent('SELECT', '')).toBe('SELECT');
    });

    it('should handle identical content (starts with check passes)', () => {
      expect(accumulateContent('SELECT', 'SELECT')).toBe('SELECT');
    });

    it('should handle JSON-like SSE data', () => {
      let acc = '';
      acc = accumulateContent(acc, '{"content":');
      acc = accumulateContent(acc, ' "SELECT *');
      acc = accumulateContent(acc, ' FROM users"}');
      expect(acc).toBe('{"content": "SELECT * FROM users"}');
    });
  });
});
