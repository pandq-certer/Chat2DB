export type SqlCategory = 'SELECT_AGGREGATE' | 'SELECT_PLAIN' | 'DML' | 'DDL';

/** Strip SQL comments (--) and leading whitespace to find the first keyword */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

/** Classify a SQL statement into one of four categories */
export function classifySql(sql: string): SqlCategory {
  const cleaned = stripComments(sql);

  if (/^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\s/i.test(cleaned)) {
    return 'DDL';
  }
  if (/^\s*(INSERT|UPDATE|DELETE|MERGE)\s/i.test(cleaned)) {
    return 'DML';
  }

  // SELECT-like (includes WITH ... SELECT)
  const isSelect =
    /^\s*SELECT\s/i.test(cleaned) || /^\s*WITH\b/i.test(cleaned);

  if (isSelect) {
    const hasAggregate =
      /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(cleaned) ||
      /\bGROUP\s+BY\b/i.test(cleaned);
    return hasAggregate ? 'SELECT_AGGREGATE' : 'SELECT_PLAIN';
  }

  // SHOW / DESCRIBE / EXPLAIN etc. — read-only, never add LIMIT
  if (/^\s*(SHOW|DESCRIBE|DESC|EXPLAIN)\s/i.test(cleaned)) {
    return 'SELECT_AGGREGATE'; // treated as read-only, no LIMIT added
  }

  // Default: treat unknown as SELECT_PLAIN for safety
  return 'SELECT_PLAIN';
}

/** Prepare SQL for execution based on its category */
export function prepareSqlForExecution(
  sql: string,
  category: SqlCategory,
): string {
  if (category === 'SELECT_PLAIN') {
    // Fix LIMIT without space (e.g., "LIMIT10" → "LIMIT 10")
    let fixed = sql.replace(/\bLIMIT(\d+)/gi, 'LIMIT $1');

    // Only add LIMIT if not already present
    if (!/\bLIMIT\s+\d/i.test(fixed)) {
      const trimmed = fixed.replace(/;\s*$/, '');
      return `${trimmed} LIMIT 10;`;
    }
    return fixed;
  }
  return sql;
}

/** Which execution method to use */
export function getExecutionMethod(
  category: SqlCategory,
): 'executeSql' | 'executeDDL' {
  return category === 'DDL' ? 'executeDDL' : 'executeSql';
}

/** Human-readable label for a category */
export function getCategoryLabel(category: SqlCategory): string {
  switch (category) {
    case 'DDL':
      return '数据库结构变更';
    case 'DML':
      return '数据修改';
    case 'SELECT_AGGREGATE':
      return '聚合查询';
    case 'SELECT_PLAIN':
      return '数据查询';
  }
}
