"use client";

import { useState, useEffect, useRef } from 'react';

const TOKEN_NAMES = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'WIF',
};

const TOKEN_ADDRESSES = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

export default function SwapInterface() {
  const [inputToken, setInputToken] = useState('SOL');
  const [outputToken, setOutputToken] = useState('WIF');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [txResult, setTxResult] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [balances, setBalances] = useState({
    SOL: 0,
    WIF: 0
  });
  const [logs, setLogs] = useState([]);
  const logsContainerRef = useRef(null);
  
  // 로그 컨테이너 자동 스크롤
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSwap = async () => {
    try {
      setLoading(true);
      setLogs([]); // 이전 로그 초기화
      
      const inputTokenAddress = TOKEN_ADDRESSES[inputToken];
      const outputTokenAddress = TOKEN_ADDRESSES[outputToken];
      
      addLocalLog(`스왑 요청: ${amount} ${inputToken} → ${outputToken}`);

      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          inputToken: inputTokenAddress,
          outputToken: outputTokenAddress,
          amount: amount
        })
      });
      
      const responseData = await response.json();
      
      // 로그 표시
      if (responseData.logs && Array.isArray(responseData.logs)) {
        setLogs(responseData.logs);
      }
      
      if (!response.ok) {
        throw new Error(responseData.error || '트랜잭션 처리 중 오류가 발생했습니다.');
      }

      // 지갑 주소 저장
      if (responseData.walletAddress && !walletAddress) {
        setWalletAddress(responseData.walletAddress);
      }
      
      // 결과 저장
      setTxResult(responseData);
      
      // 잔액 업데이트
      if (responseData.balances && responseData.balances.after) {
        const updatedBalances = { ...balances };
        
        // 입력 토큰 잔액 업데이트
        const inputTokenName = TOKEN_NAMES[inputTokenAddress] || inputToken;
        updatedBalances[inputTokenName] = responseData.balances.after.inputToken;
        
        // 출력 토큰 잔액 업데이트
        const outputTokenName = TOKEN_NAMES[outputTokenAddress] || outputToken;
        updatedBalances[outputTokenName] = responseData.balances.after.outputToken;
        
        setBalances(updatedBalances);
      }
      
    } catch (error) {
      console.error('스왑 처리 중 오류:', error);
      setTxResult({ error: error.message });
      addLocalLog(`오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const addLocalLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prevLogs => [...prevLogs, `[${timestamp}] ${message}`]);
  };
  
  // 소수점 자리수 제한 함수
  const formatNumber = (num, decimals = 6) => {
    if (num === undefined || num === null) return '0';
    return Number(num).toFixed(decimals);
  };

  return (
    <div className="swap-container">
      <div className="swap-box">
        <h2>토큰 스왑</h2>
        
        {/* 지갑 정보 및 잔액 */}
        <div className="wallet-info">
          <h3>지갑 정보</h3>
          <div className="wallet-address">
            {walletAddress ? (
              <>
                <div className="address-label">주소:</div>
                <div className="address-value">{`${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`}</div>
              </>
            ) : (
              <div className="address-value">트랜잭션 후 표시됩니다</div>
            )}
          </div>
          
          <div className="balances">
            <h4>잔액</h4>
            {Object.entries(balances).map(([token, balance]) => (
              <div key={token} className="balance-item">
                <span className="token-name">{token}:</span>
                <span className="token-amount">{formatNumber(balance)}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* 스왑 입력 */}
        <div className="swap-form">
          <div className="input-group">
            <select 
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="token-select"
            >
              {Object.keys(TOKEN_ADDRESSES).map(token => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
            
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="수량을 입력하세요"
              step="0.000000001"
              className="amount-input"
            />
          </div>

          <div className="swap-arrow">↓</div>

          <div className="input-group">
            <select
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value)}
              className="token-select"
            >
              {Object.keys(TOKEN_ADDRESSES).map(token => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={handleSwap}
            disabled={loading || !amount || inputToken === outputToken}
            className="swap-button"
          >
            {loading ? '처리 중...' : '스왑'}
          </button>
        </div>

        {/* 트랜잭션 결과 */}
        {txResult && (
          <div className={`result-box ${txResult.error ? 'error' : 'success'}`}>
            <h3>트랜잭션 결과</h3>
            
            {txResult.error ? (
              <p className="error-message">{txResult.error}</p>
            ) : (
              <>
                <div className="status-message">
                  {txResult.success ? '✅ 트랜잭션이 성공적으로 처리되었습니다.' : '트랜잭션이 제출되었습니다.'}
                </div>
                
                {txResult.hash && (
                  <div className="transaction-hash">
                    <div>트랜잭션 해시:</div>
                    <div className="hash-value">{`${txResult.hash.slice(0, 10)}...${txResult.hash.slice(-6)}`}</div>
                  </div>
                )}
                
                {txResult.duration && (
                  <div className="duration">처리 시간: {txResult.duration}초</div>
                )}
                
                {txResult.solscanUrl && (
                  <div className="solscan-link">
                    <a href={txResult.solscanUrl} target="_blank" rel="noopener noreferrer">
                      Solscan에서 확인하기
                    </a>
                  </div>
                )}
                
                {/* 잔액 변화 표시 */}
                {txResult.balances && (
                  <div className="balance-changes">
                    <h4>잔액 변화</h4>
                    
                    <div className="balance-change-item">
                      <span className="token-name">{inputToken}:</span>
                      <span className={`change-value ${txResult.balances.diff.inputToken >= 0 ? 'positive' : 'negative'}`}>
                        {txResult.balances.diff.inputToken >= 0 ? '+' : ''}
                        {formatNumber(txResult.balances.diff.inputToken)}
                      </span>
                    </div>
                    
                    <div className="balance-change-item">
                      <span className="token-name">{outputToken}:</span>
                      <span className={`change-value ${txResult.balances.diff.outputToken >= 0 ? 'positive' : 'negative'}`}>
                        {txResult.balances.diff.outputToken >= 0 ? '+' : ''}
                        {formatNumber(txResult.balances.diff.outputToken)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        
        {/* 로그 표시 */}
        <div className="logs-section">
          <h3>로그</h3>
          <div className="logs-container" ref={logsContainerRef}>
            {logs.length === 0 ? (
              <div className="no-logs">트랜잭션을 실행하면 로그가 표시됩니다.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .swap-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        
        .swap-box {
          background-color: #f8f9fa;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        }
        
        h2 {
          margin-top: 0;
          color: #333;
          text-align: center;
          margin-bottom: 24px;
        }
        
        h3 {
          margin-top: 0;
          font-size: 18px;
          color: #444;
          margin-bottom: 12px;
        }
        
        h4 {
          margin-top: 12px;
          margin-bottom: 8px;
          font-size: 16px;
          color: #555;
        }
        
        .wallet-info {
          background-color: #fff;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .wallet-address {
          display: flex;
          margin-bottom: 12px;
          font-size: 14px;
        }
        
        .address-label {
          margin-right: 8px;
          color: #666;
        }
        
        .address-value {
          font-family: monospace;
          color: #333;
        }
        
        .balances {
          background-color: #f0f4f8;
          border-radius: 6px;
          padding: 10px;
        }
        
        .balance-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          padding: 4px 8px;
        }
        
        .token-name {
          font-weight: 500;
          color: #444;
        }
        
        .token-amount {
          font-family: monospace;
        }
        
        .swap-form {
          background-color: #fff;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .input-group {
          display: flex;
          margin-bottom: 12px;
        }
        
        .token-select {
          flex: 0 0 80px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px 0 0 4px;
          background-color: #f8f9fa;
        }
        
        .amount-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-left: none;
          border-radius: 0 4px 4px 0;
        }
        
        .swap-arrow {
          text-align: center;
          font-size: 20px;
          margin: 8px 0;
          color: #666;
        }
        
        .swap-button {
          width: 100%;
          padding: 12px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }
        
        .swap-button:hover {
          background-color: #45a049;
        }
        
        .swap-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        .result-box {
          background-color: #fff;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .result-box.success {
          border-left: 4px solid #4CAF50;
        }
        
        .result-box.error {
          border-left: 4px solid #f44336;
        }
        
        .error-message {
          color: #f44336;
        }
        
        .status-message {
          margin-bottom: 8px;
          color: #4CAF50;
          font-weight: 500;
        }
        
        .transaction-hash {
          display: flex;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .hash-value {
          font-family: monospace;
          margin-left: 8px;
        }
        
        .solscan-link {
          margin-top: 12px;
        }
        
        .solscan-link a {
          color: #2196F3;
          text-decoration: none;
        }
        
        .solscan-link a:hover {
          text-decoration: underline;
        }
        
        .balance-changes {
          margin-top: 16px;
          padding: 8px;
          background-color: #f0f4f8;
          border-radius: 6px;
        }
        
        .balance-change-item {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
        }
        
        .change-value {
          font-family: monospace;
        }
        
        .positive {
          color: #4CAF50;
        }
        
        .negative {
          color: #f44336;
        }
        
        .logs-section {
          background-color: #fff;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .logs-container {
          background-color: #282c34;
          color: #abb2bf;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          padding: 12px;
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .no-logs {
          color: #777;
          font-style: italic;
          padding: 8px 0;
        }
        
        .log-entry {
          padding: 2px 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}