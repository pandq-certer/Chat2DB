import React, { useState, useRef, useCallback } from 'react';
import { Popover } from 'antd';
import CascaderDB from '@/components/CascaderDB';
import { useAIChatStore } from './store';
import styles from './ChatInputArea.less';

const ChatInputArea: React.FC = () => {
  const { isStreaming, selectedDataSource, setDataSource, closeEventSource, pendingConfirmation } = useAIChatStore();
  const [inputValue, setInputValue] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBlocked = isStreaming || !!pendingConfirmation;

  const handleDataSourceChange = useCallback(
    (value: { dataSourceId: number; databaseName: string; schemaName: string; dataSourceName?: string }) => {
      const dsName = value.dataSourceName || `数据源 #${value.dataSourceId}`;
      const displayName = value.databaseName ? `${dsName} / ${value.databaseName}` : dsName;
      setDataSource({ ...value, dataSourceName: displayName });
      // Only close popover when user has selected a database
      if (value.databaseName) {
        setPopoverOpen(false);
      }
    },
    [setDataSource],
  );

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isBlocked) return;
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // Trigger the parent's onSend via store action
    // The parent (AIChatPanel) watches for this
    useAIChatStore.getState().addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
  }, [inputValue, isBlocked]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-grow
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const dsLabel = selectedDataSource.dataSourceName
    || (selectedDataSource.dataSourceId
      ? `数据源 #${selectedDataSource.dataSourceId}`
      : null);

  return (
    <div className={styles.inputArea}>
      {/* Data source selector */}
      <div className={styles.dsRow}>
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          placement="topLeft"
          trigger="click"
          content={
            <div style={{ width: 260 }}>
              <CascaderDB onChange={handleDataSourceChange} />
            </div>
          }
        >
          <span className={styles.dsPill}>
            @ {dsLabel || '选择数据源'}
          </span>
        </Popover>
      </div>

      {/* Input row */}
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={isBlocked ? 'AI 正在回复...' : '输入消息，Enter 发送...'}
          disabled={isBlocked}
          rows={1}
        />
        {isStreaming ? (
          <button className={styles.stopBtn} onClick={() => closeEventSource?.()}>
            停止
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            ➤
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatInputArea;
