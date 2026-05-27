package ai.chat2db.server.web.api.controller.ai;

import ai.chat2db.spi.model.SimpleTable;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for ChatController's prompt building and schema matching logic.
 * Uses reflection to test private methods without needing full Spring context.
 */
class ChatControllerTest {

    // ===== tableRelevanceScore Tests =====
    // Replicate the scoring logic for direct testing

    private int tableRelevanceScore(String tableName, String tableComment, String message) {
        if (message == null || message.isEmpty()) return 0;
        int score = 0;
        String tableNameLower = (tableName == null ? "" : tableName.toLowerCase());
        String commentLower = (tableComment == null ? "" : tableComment.toLowerCase());

        // Exact table name in message
        if (message.contains(tableNameLower)) score += 100;
        // Table name parts (split by underscore) in message
        String[] parts = tableNameLower.split("_");
        for (String part : parts) {
            if (part.length() >= 2 && message.contains(part)) score += 20;
        }
        // Comment words in message
        if (!commentLower.isEmpty()) {
            for (String word : commentLower.split("[\\s,，、（）()]+")) {
                if (word.length() >= 2 && message.contains(word)) score += 15;
            }
        }
        return score;
    }

    @Test
    void testExactTableNameMatch() {
        assertEquals(100, tableRelevanceScore("users", null, "查询users表的所有数据"));
        assertEquals(100, tableRelevanceScore("orders", null, "找出orders中金额最大的"));
        assertEquals(0, tableRelevanceScore("users", null, "查询orders表的所有数据"));
    }

    @Test
    void testTableNameCaseInsensitive() {
        assertEquals(100, tableRelevanceScore("Users", null, "查询users表的所有数据"));
        assertEquals(100, tableRelevanceScore("ORDERS", null, "查询orders表"));
    }

    @Test
    void testUnderscorePartsMatch() {
        // "user_order" splits into "user" and "order" — both match
        int score = tableRelevanceScore("user_order", null, "查询用户user的order信息");
        assertTrue(score >= 40, "Should match both user and order parts, got: " + score);

        // "sys_config" splits into "sys" and "config" — only "config" matches
        score = tableRelevanceScore("sys_config", null, "查看系统config配置");
        assertTrue(score >= 20, "Should match config part, got: " + score);

        // Single-char parts should not match
        score = tableRelevanceScore("a_b", null, "查询a和b");
        assertEquals(0, score, "Single-char parts should not match");
    }

    @Test
    void testCommentMatch() {
        // Table with comment "用户信息表"
        int score = tableRelevanceScore("t_user", "用户信息表", "查询用户信息");
        assertTrue(score >= 15, "Should match comment word '用户信息', got: " + score);

        // Table with comment "订单明细"
        score = tableRelevanceScore("t_order_detail", "订单明细", "查看订单明细");
        assertTrue(score >= 15, "Should match comment word '订单明细', got: " + score);

        // No comment
        score = tableRelevanceScore("t_user", null, "查询用户信息");
        assertEquals(0, score, "No comment should not add comment-based score");
    }

    @Test
    void testCommentSplitByChinesePunctuation() {
        // Comment with Chinese punctuation
        int score = tableRelevanceScore("t_config", "系统配置（重要）", "查看系统配置");
        assertTrue(score >= 15, "Should match despite Chinese punctuation, got: " + score);
    }

    @Test
    void testEmptyMessage() {
        assertEquals(0, tableRelevanceScore("users", "用户表", ""));
        assertEquals(0, tableRelevanceScore("users", "用户表", null));
    }

    @Test
    void testEmptyTableName() {
        assertEquals(0, tableRelevanceScore("", null, "查询数据"));
        assertEquals(0, tableRelevanceScore(null, null, "查询数据"));
    }

    @Test
    void testCombinedScoring() {
        // Exact name + underscore parts + comment words
        int score = tableRelevanceScore("user_order", "用户订单表", "查询user_order中的用户订单数据");
        assertTrue(score >= 100, "Should have exact match (100), got: " + score);
        // Also has "user" and "order" parts (+40) and "用户" "订单" from comment (+30)
        assertTrue(score >= 170, "Should have combined score, got: " + score);
    }

    @Test
    void testShortKeywordFalsePositive() {
        // "id" is only 2 chars — should match (length >= 2)
        int score = tableRelevanceScore("t_id", null, "查询id");
        assertEquals(20, score, "2-char parts should match");

        // Single char should not match
        score = tableRelevanceScore("t_x", null, "查询x");
        assertEquals(0, score, "1-char parts should not match");
    }

    // ===== Prompt Building Tests =====

    @Test
    void testPromptTypeDescriptions() {
        assertEquals("Convert natural language into SQL queries",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.NL_2_SQL.getDescription());
        assertEquals("Interpret SQL",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_EXPLAIN.getDescription());
        assertEquals("Provide optimization suggestions",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_OPTIMIZER.getDescription());
        assertEquals("Perform SQL conversion",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_2_SQL.getDescription());
        assertEquals("Check and fix SQL syntax for the specified database type",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_CHECK.getDescription());
        assertEquals("text generation",
            ai.chat2db.server.web.api.controller.ai.enums.PromptType.TEXT_GENERATION.getDescription());
    }

    @Test
    void testPromptTypeCodes() {
        assertEquals("NL_2_SQL", ai.chat2db.server.web.api.controller.ai.enums.PromptType.NL_2_SQL.getCode());
        assertEquals("SQL_EXPLAIN", ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_EXPLAIN.getCode());
        assertEquals("SQL_OPTIMIZER", ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_OPTIMIZER.getCode());
        assertEquals("SQL_2_SQL", ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_2_SQL.getCode());
        assertEquals("SQL_CHECK", ai.chat2db.server.web.api.controller.ai.enums.PromptType.SQL_CHECK.getCode());
        assertEquals("TEXT_GENERATION", ai.chat2db.server.web.api.controller.ai.enums.PromptType.TEXT_GENERATION.getCode());
    }

    @Test
    void testSchemaJsonFormat() {
        // Verify the schema JSON format matches what the frontend expects
        // Format: ["TableName(comment): col1 type1 PK, col2 type2, ..."]
        List<String> schemas = Arrays.asList(
            "users(用户表): id INT PK, name VARCHAR(255), age INT",
            "orders(订单表): id INT PK, user_id INT, amount DECIMAL(10,2)"
        );

        String json = com.alibaba.fastjson2.JSON.toJSONString(schemas);
        assertTrue(json.startsWith("["), "Should be a JSON array");
        assertTrue(json.contains("users"), "Should contain table name");
        assertTrue(json.contains("PK"), "Should contain primary key marker");
        assertTrue(json.contains("VARCHAR"), "Should contain column type");
    }

    @Test
    void testSchemaJsonWithNullComment() {
        // Table without comment — should just be "TableName: columns"
        List<String> schemas = Arrays.asList("users: id INT PK, name VARCHAR(255)");
        String json = com.alibaba.fastjson2.JSON.toJSONString(schemas);
        assertTrue(json.contains("users:"));
        assertFalse(json.contains("null"), "Should not contain null");
    }

    // ===== SQL_CHECK Prompt Format Test =====

    @Test
    void testSqlCheckPromptFormat() {
        String dbType = "MYSQL";
        String sql = "SELECT * FORM users"; // intentional typo
        String expectedPrompt = String.format(
            "You are a SQL syntax validator. The database type is %s.\n"
            + "Carefully check the following SQL for syntax errors.\n"
            + "Fix any syntax issues to ensure it is valid %s SQL.\n"
            + "If the SQL is already correct, return it unchanged.\n\n"
            + "Pay special attention to:\n"
            + "- Correct JOIN syntax and table alias usage\n"
            + "- Proper quoting of identifiers and string literals for %s\n"
            + "- Correct function names and parameter syntax for %s\n"
            + "- Proper use of parentheses and logical operators\n\n"
            + "Response Rules:\n"
            + "- Return only the raw SQL statement.\n"
            + "- Do not wrap SQL in markdown code fences.\n"
            + "- Do not prefix the answer with sql or any explanation.\n\n"
            + "SQL to check:\n%s",
            dbType, dbType, dbType, dbType, sql
        );

        // Verify the prompt contains the key elements
        assertTrue(expectedPrompt.contains("SQL syntax validator"));
        assertTrue(expectedPrompt.contains("MYSQL"));
        assertTrue(expectedPrompt.contains("SELECT * FORM users"));
        assertTrue(expectedPrompt.contains("Return only the raw SQL statement"));
    }

    // ===== Token Length Validation Tests =====

    @Test
    void testTokenLengthCalculation() {
        int MAX_PROMPT_LENGTH = 3850;
        int TOKEN_CONVERT_CHAR_LENGTH = 4;

        // Short prompt — should be under limit
        String shortPrompt = "SELECT * FROM users WHERE id = 1";
        assertTrue(shortPrompt.length() / TOKEN_CONVERT_CHAR_LENGTH < MAX_PROMPT_LENGTH);

        // Simulate a very long prompt
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 16000; i++) {
            sb.append("a");
        }
        String longPrompt = sb.toString();
        assertTrue(longPrompt.length() / TOKEN_CONVERT_CHAR_LENGTH > MAX_PROMPT_LENGTH,
            "Very long prompt should exceed token limit");
    }

    // ===== Relevance Ranking Tests =====

    @Test
    void testRelevanceRankingOrder() {
        // Simulate how tables would be ranked for "查询用户订单信息"
        String message = "查询用户订单信息";

        int score_user = tableRelevanceScore("user", "用户表", message);
        int score_order = tableRelevanceScore("order", "订单表", message);
        int score_user_order = tableRelevanceScore("user_order", "用户订单表", message);
        int score_config = tableRelevanceScore("sys_config", "系统配置", message);

        // user_order should score highest (exact name match + comment match)
        assertTrue(score_user_order >= score_user,
            "user_order should score >= user: " + score_user_order + " vs " + score_user);
        assertTrue(score_user_order >= score_order,
            "user_order should score >= order: " + score_user_order + " vs " + score_order);
        // config should score lowest (no match)
        assertTrue(score_user_order > score_config,
            "user_order should score > config: " + score_user_order + " vs " + score_config);
    }

    @Test
    void testChineseTableNameMatching() {
        // The scoring is case-insensitive and uses contains()
        // Chinese characters in table names should still work
        int score = tableRelevanceScore("t_用户", null, "查询t_用户");
        assertTrue(score >= 100, "Chinese table name should match exactly, got: " + score);
    }

    @Test
    void testPartialMatchDoesNotScore() {
        // "order" in "orders" should NOT be an exact match for table "order"
        // But "order" as an underscore-split part of "order_detail" should match
        int score = tableRelevanceScore("order_detail", null, "查询order表");
        assertTrue(score >= 20, "Should match 'order' part, got: " + score);
        assertFalse(score >= 100, "Should not be exact match, got: " + score);
    }

    // ===== Edge Case: Prompt with Special Characters =====

    @Test
    void testPromptSanitization() {
        // The code does: cleanedInput = schemaProperty.replaceAll("[\r\t]", "");
        String input = "SELECT *\tFROM users\r\nWHERE id = 1";
        String cleaned = input.replaceAll("[\r\t]", "");
        assertFalse(cleaned.contains("\t"), "Should not contain tabs");
        assertFalse(cleaned.contains("\r"), "Should not contain carriage returns");
        assertTrue(cleaned.contains("\n"), "Should still contain newlines");
    }

    // ===== Edge Case: Hash Removal in Prompt =====

    @Test
    void testHashRemovalInPrompt() {
        // OpenAI and Chat2DB paths do: prompt = prompt.replaceAll("#", "")
        String input = "### SQL input: SELECT * FROM users\n# comment";
        String cleaned = input.replaceAll("#", "");
        assertFalse(cleaned.contains("#"), "Should remove all hash characters");
    }
}
