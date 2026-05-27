import React, { useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAIChatStore } from './store';
import ChatMessageList from './ChatMessageList';
import ChatInputArea from './ChatInputArea';
import { connectPostSse } from '@/utils/postEventSource';
import i18n from '@/i18n';
import Iconfont from '@/components/Iconfont';
import { useWorkspaceStore } from '@/pages/main/workspace/store';
import { useSettingStore } from '@/store/setting';
import connectionService from '@/service/connection';
import styles from './index.less';

const AIChatPanel: React.FC = () => {
  const {
    messages,
    isStreaming,
    selectedDataSource,
    addMessage,
    updateStreamingContent,
    finalizeStreaming,
    setStreaming,
    setCloseEventSource,
    clearChat,
    setPendingConfirmation,
    updateLastMessage,
    pendingConfirmation,
  } = useAIChatStore();

  const { setDataSource, currentSessionId } = useAIChatStore();
  const currentConnectionDetails = useWorkspaceStore(
    (state) => state.currentConnectionDetails,
  );
  const { aiConfig } = useSettingStore((state) => ({
    aiConfig: state.aiConfig,
  }));

  const prevMsgCountRef = useRef(messages.length);

  // Initialize selectedDataSource from current workspace connection
  useEffect(() => {
    if (!currentConnectionDetails) return;

    const dsId = currentConnectionDetails.id;
    const dsName =
      currentConnectionDetails.alias || `数据源 #${dsId}`;

    if (!selectedDataSource.dataSourceId) {
      setDataSource({
        dataSourceId: dsId,
        dataSourceName: dsName,
        databaseName: '',
        schemaName: '',
      });

      connectionService
        .getDatabaseList({ dataSourceId: dsId })
        .then((dbs: any[]) => {
          if (dbs?.length > 0) {
            const firstName = dbs[0].name;
            const store = useAIChatStore.getState();
            if (!store.selectedDataSource.databaseName) {
              store.setDataSource({
                ...store.selectedDataSource,
                dataSourceName: `${dsName} / ${firstName}`,
                databaseName: firstName,
                schemaName: '',
              });
            }
          }
        });
    }
  }, [currentConnectionDetails, selectedDataSource.dataSourceId, setDataSource]);

  // Watch for new user messages and trigger copilot call
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (messages.length <= prevCount) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'user' || isStreaming || pendingConfirmation) return;

    // Add assistant placeholder message
    addMessage({
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });
    setStreaming(true);

    const dsId =
      selectedDataSource.dataSourceId || currentConnectionDetails?.id;

    const body: any = {
      sessionId: currentSessionId || undefined,
      message: lastMsg.content,
      datasourceContext: dsId
        ? {
            dataSourceId: dsId,
            databaseName: selectedDataSource.databaseName || undefined,
            schemaName: selectedDataSource.schemaName || undefined,
          }
        : undefined,
    };

    // Add custom LLM config if available
    if (aiConfig?.apiHost && aiConfig?.apiKey) {
      body.llm_url = aiConfig.apiHost;
      body.llm_api_key = aiConfig.apiKey;
      body.llm_model = aiConfig.model || undefined;
    }

    const thinkingSteps: string[] = [];

    const close = connectPostSse({
      url: '/api/ai/copilot/chat',
      body,
      onEvent: (event) => {
        const { type, data } = event;

        switch (type) {
          case 'session':
            useAIChatStore.setState({
              currentSessionId: data?.sessionId,
              currentTraceId: data?.traceId,
            });
            break;

          case 'status':
            thinkingSteps.push(data);
            updateStreamingContent(data || '');
            updateLastMessage({ thinkingSteps: [...thinkingSteps] });
            break;

          case 'plan':
            updateStreamingContent(`意图: ${data?.intent || ''}`);
            break;

          case 'schema':
            updateLastMessage({ schema: data?.tables || [] });
            updateStreamingContent(`检索到表: ${(data?.tables || []).join(', ')}`);
            break;

          case 'sql':
            updateLastMessage({
              sqlContent: data?.content || '',
              sqlType: data?.sqlType,
            });
            updateStreamingContent(`SQL:\n${data?.content || ''}`);
            break;

          case 'confirm':
            updateLastMessage({
              sqlContent: data?.sql || '',
              sqlType: data?.sqlType,
              confirmationState: 'pending',
            });
            useAIChatStore.setState({
              pendingConfirmation: {
                sql: data?.sql || '',
                sqlType: data?.sqlType || '',
                sessionId: useAIChatStore.getState().currentSessionId || '',
                traceId: useAIChatStore.getState().currentTraceId || '',
              },
            });
            finalizeStreaming();
            break;

          case 'result':
            const resultMsg = data?.success
              ? `查询成功，${data?.rowCount || 0} 行结果`
              : `查询失败: ${data?.message || '未知错误'}`;
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
  }, [messages.length]);

  const handleNewChat = useCallback(() => {
    clearChat();
  }, [clearChat]);

  return (
    <div className={styles.chatPanel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{i18n('chat.ai.panel.title')}</span>
        <div className={styles.headerActions}>
          <button
            className={styles.headerBtn}
            onClick={handleNewChat}
            title={i18n('chat.ai.panel.newChat')}
          >
            <Iconfont code="&#xe643;" size={14} />
          </button>
        </div>
      </div>

      <ChatMessageList />
      <ChatInputArea />
    </div>
  );
};

export default AIChatPanel;
