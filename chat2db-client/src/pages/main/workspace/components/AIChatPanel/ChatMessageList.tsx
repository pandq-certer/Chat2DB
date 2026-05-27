import React, { useEffect, useRef } from 'react';
import { IChatMessage } from '@/typings/aichat';
import { useAIChatStore, IPendingConfirmation } from './store';
import { connectPostSse } from '@/utils/postEventSource';
import styles from './ChatMessageList.less';

const ThinkingSection: React.FC<{
  steps: string[];
  schema?: string[];
}> = ({ steps, schema }) => (
  <div className={styles.thinkingBlock}>
    <div className={styles.thinkingHeader}>
      <span className={styles.thinkingIcon}>&#xe66c;</span>
      思考过程
    </div>
    {steps.map((step, i) => (
      <div key={i} className={styles.thinkingText}>{step}</div>
    ))}
    {schema && schema.length > 0 && (
      <div className={styles.thinkingText}>
        检索到表: {schema.join(', ')}
      </div>
    )}
  </div>
);

const SqlBlock: React.FC<{ sql: string; sqlType?: string }> = ({ sql, sqlType }) => (
  <div className={styles.sqlBlock}>
    <div className={styles.sqlLabel}>{sqlType || 'SQL'}</div>
    <pre className={styles.sqlCode}>{sql}</pre>
  </div>
);

const SqlConfirmationCard: React.FC<{
  sql: string;
  sqlType: string;
  state: 'pending' | 'confirmed' | 'cancelled';
}> = ({ sql, sqlType, state }) => {
  const pending = useAIChatStore((s) => s.pendingConfirmation);
  const setPendingConfirmation = useAIChatStore((s) => s.setPendingConfirmation);
  const setStreaming = useAIChatStore((s) => s.setStreaming);
  const setCloseEventSource = useAIChatStore((s) => s.setCloseEventSource);
  const updateStreamingContent = useAIChatStore((s) => s.updateStreamingContent);
  const updateLastMessage = useAIChatStore((s) => s.updateLastMessage);
  const finalizeStreaming = useAIChatStore((s) => s.finalizeStreaming);
  const addMessage = useAIChatStore((s) => s.addMessage);

  if (state === 'confirmed') {
    return (
      <div className={styles.confirmBadge}>
        <span className={styles.confirmBadgeOk}>&#10003;</span> 已确认执行
      </div>
    );
  }

  if (state === 'cancelled') {
    return (
      <div className={styles.confirmBadge}>
        <span className={styles.confirmBadgeCancel}>&#10007;</span> 已取消执行
      </div>
    );
  }

  const isDDL = sqlType === 'DDL';
  const warningText = isDDL
    ? '此操作将修改数据库结构，执行后不可撤销'
    : '此操作将修改数据，请确认后执行';

  const handleConfirm = (confirmed: boolean) => {
    if (!confirmed) {
      updateLastMessage({
        confirmationState: 'cancelled',
        content: '已取消执行',
      });
      setPendingConfirmation(null);
      return;
    }

    updateLastMessage({ confirmationState: 'confirmed', isStreaming: true });
    setStreaming(true);
    setPendingConfirmation(null);

    const currentPending = pending;
    if (!currentPending) return;

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    const close = connectPostSse({
      url: '/api/ai/copilot/confirm',
      body: {
        sessionId: currentPending.sessionId,
        traceId: currentPending.traceId,
        confirmed: true,
      },
      onEvent: (event) => {
        const { type, data } = event;
        switch (type) {
          case 'status':
            updateStreamingContent(data || '');
            break;
          case 'sql':
            updateLastMessage({ sqlContent: data?.content || '' });
            updateStreamingContent(`SQL:\n${data?.content || ''}`);
            break;
          case 'result':
            const resultMsg = data?.success
              ? `执行成功，${data?.rowCount || 0} 行结果`
              : `执行失败: ${data?.message || '未知错误'}`;
            updateLastMessage({ resultSummary: resultMsg });
            updateStreamingContent(resultMsg);
            break;
          case 'answer':
            updateStreamingContent(data?.content || '');
            break;
          case 'done':
            finalizeStreaming();
            break;
          case 'error':
            updateStreamingContent(data?.message || '发生错误');
            updateLastMessage({ error: true });
            finalizeStreaming();
            break;
        }
      },
      onError: (err) => {
        updateStreamingContent(`连接错误: ${err.message}`);
        updateLastMessage({ error: true });
        finalizeStreaming();
      },
    });

    setCloseEventSource(close);
  };

  return (
    <div className={styles.confirmationCard}>
      <div className={styles.confirmationWarning}>
        <span className={styles.confirmationWarnIcon}>!</span>
        {warningText}（{sqlType}）
      </div>
      <pre className={styles.confirmationSql}>{sql}</pre>
      <div className={styles.confirmationActions}>
        <button
          className={styles.confirmBtnPrimary}
          onClick={() => handleConfirm(true)}
        >
          确认执行
        </button>
        <button
          className={styles.confirmBtnGhost}
          onClick={() => handleConfirm(false)}
        >
          取消
        </button>
      </div>
    </div>
  );
};

const MessageContent: React.FC<{ msg: IChatMessage }> = ({ msg }) => {
  const hasThinking = (msg.thinkingSteps && msg.thinkingSteps.length > 0) || (msg.schema && msg.schema.length > 0);
  const hasSql = !!msg.sqlContent;
  const hasConfirm = !!msg.confirmationState;
  const hasResult = !!msg.resultSummary;
  const hasAnswer = !!msg.content && !msg.isStreaming;

  // During streaming with no structured data yet, show raw text
  if (msg.isStreaming && !hasThinking && !hasSql) {
    return <span className={styles.bubbleText}>{msg.content}</span>;
  }

  return (
    <>
      {hasThinking && (
        <ThinkingSection
          steps={msg.thinkingSteps || []}
          schema={msg.schema}
        />
      )}
      {hasSql && !hasConfirm && (
        <SqlBlock sql={msg.sqlContent!} sqlType={msg.sqlType} />
      )}
      {hasResult && (
        <div className={styles.thinkingText}>{msg.resultSummary}</div>
      )}
      {hasConfirm && msg.sqlContent && (
        <SqlConfirmationCard
          sql={msg.sqlContent}
          sqlType={msg.sqlType || 'DML'}
          state={msg.confirmationState!}
        />
      )}
      {hasAnswer && <span className={styles.bubbleText}>{msg.content}</span>}
      {msg.isStreaming && !hasAnswer && (
        <span className={styles.typingDots}>
          <span />
          <span />
          <span />
        </span>
      )}
    </>
  );
};

const ChatMessageList: React.FC = () => {
  const { messages, streamingContent } = useAIChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const displayMessages = [...messages];

  if (displayMessages.length > 0) {
    const last = displayMessages[displayMessages.length - 1];
    if (last.isStreaming) {
      displayMessages[displayMessages.length - 1] = {
        ...last,
        content: streamingContent,
      };
    }
  }

  return (
    <div className={styles.messageList}>
      {displayMessages.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>&#xe8ad;</span>
          <p>AI 助手</p>
          <p className={styles.emptyHint}>输入消息开始对话</p>
        </div>
      )}
      {displayMessages.map((msg) => (
        <div
          key={msg.id}
          className={`${styles.messageRow} ${
            msg.role === 'user'
              ? styles.messageRowUser
              : styles.messageRowAssistant
          }`}
        >
          {msg.role === 'assistant' && (
            <div className={styles.avatarAssistant}>AI</div>
          )}
          <div
            className={`${styles.bubble} ${
              msg.role === 'user'
                ? styles.bubbleUser
                : styles.bubbleAssistant
            } ${msg.error ? styles.bubbleError : ''}`}
          >
            {msg.content || msg.sqlContent || msg.thinkingSteps?.length ? (
              <MessageContent msg={msg} />
            ) : msg.isStreaming ? (
              <span className={styles.typingDots}>
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </div>
          {msg.role === 'user' && (
            <div className={styles.avatarUser}>U</div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatMessageList;
