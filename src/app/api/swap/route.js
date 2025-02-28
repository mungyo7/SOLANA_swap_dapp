import { NextResponse } from 'next/server';
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

const API_HOST = 'https://gmgn.ai';
const SOLSCAN_URL = 'https://solscan.io/tx/';
const slippage = 3;
const fee = 0;

export const dynamic = 'force-dynamic'; // 동적 라우트 강제
export const runtime = 'nodejs';        // Node.js 런타임 사용

// 로그 메시지를 저장할 배열
const operationLogs = [];

function addLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  operationLogs.push(logMessage);
  return logMessage;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTokenDecimals(tokenAddress) {
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mintPublicKey = new PublicKey(tokenAddress);
  
  try {
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (!tokenInfo) throw new Error('토큰 계정을 찾을 수 없습니다.');
    if (!tokenInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('이 주소는 SPL 토큰이 아닙니다.');
    return tokenInfo.data[44];
  } catch (error) {
    console.error('토큰 정보를 가져오는 중 오류 발생:', error);
    throw error;
  }
}

// 토큰 잔액 조회 함수
async function getTokenBalance(walletAddress, tokenAddress) {
  addLog(`${tokenAddress} 토큰 잔액 조회 중...`);
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const walletPublicKey = new PublicKey(walletAddress);
  
  try {
    // SOL인 경우 (네이티브 토큰)
    if (tokenAddress === 'So11111111111111111111111111111111111111112') {
      const balance = await connection.getBalance(walletPublicKey);
      const solBalance = balance / 1e9; // lamports to SOL
      addLog(`SOL 잔액: ${solBalance}`);
      return solBalance;
    } 
    // SPL 토큰인 경우
    else {
      const tokenPublicKey = new PublicKey(tokenAddress);
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        walletPublicKey,
        { mint: tokenPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        addLog(`${tokenAddress}에 대한 토큰 계정이 없습니다.`);
        return 0;
      }
      
      const decimal = await getTokenDecimals(tokenAddress);
      const accountInfo = tokenAccounts.value[0].account;
      
      // Token Program v2의 데이터 구조에서 잔액 추출
      const data = Buffer.from(accountInfo.data);
      // 잔액은 64바이트 오프셋에 있는 u64 값
      const amount = data.readBigUInt64LE(64);
      const tokenBalance = Number(amount) / Math.pow(10, decimal);
      
      addLog(`${tokenAddress} 잔액: ${tokenBalance}`);
      return tokenBalance;
    }
  } catch (error) {
    addLog(`토큰 잔액 조회 실패: ${error.message}`);
    return 0;
  }
}

export async function POST(request) {
  // 로그 배열 초기화
  operationLogs.length = 0;
  addLog('=== API ROUTE START ===');
  
  try {
    const startTime = Date.now();
    
    // request body에서 데이터 파싱
    const body = await request.json();
    addLog(`요청 데이터: ${JSON.stringify(body)}`);
    const { inputToken, outputToken, amount } = body;

    // 입력 토큰 검증
    if (!inputToken) {
      return NextResponse.json(
        { error: '입력 토큰 주소가 필요합니다.', logs: operationLogs },
        { status: 400 }
      );
    }

    // 출력 토큰 검증
    if (!outputToken) {
      return NextResponse.json(
        { error: '출력 토큰 주소가 필요합니다.', logs: operationLogs },
        { status: 400 }
      );
    }

    // 입력 수량 검증
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: '올바른 수량을 입력해주세요.', logs: operationLogs },
        { status: 400 }
      );
    }

    // 입력 토큰의 decimal 정보 가져오기
    const decimal = await getTokenDecimals(inputToken);
    addLog(`입력 토큰 decimal: ${decimal}`);
    const inputAmount = (parseFloat(amount) * Math.pow(10, decimal)).toString();
    
    // 주의: 실제 환경에서는 비밀 키를 안전하게 관리해야 합니다.
    const keypair = Keypair.fromSecretKey(
        bs58.decode(
            process.env.PRIVATE_KEY
        )
    );
    const walletAddress = keypair.publicKey.toString();
    addLog(`지갑 주소: ${walletAddress}`);

    // 스왑 전 잔액 조회
    const beforeBalances = {
      inputToken: await getTokenBalance(walletAddress, inputToken),
      outputToken: await getTokenBalance(walletAddress, outputToken)
    };
    
    addLog(`스왑 전 잔액 - 입력 토큰: ${beforeBalances.inputToken}, 출력 토큰: ${beforeBalances.outputToken}`);

    // 견적 및 서명되지 않은 트랜잭션 가져오기
    addLog('라우트 정보 요청 중...');
    const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${inputToken}&token_out_address=${outputToken}&in_amount=${inputAmount}&from_address=${walletAddress}&slippage=${slippage}&fee=${fee}`;
    let route = await fetch(quoteUrl);
    route = await route.json();
    
    if (route.code !== 0) {
        const errorMsg = route.msg || '라우트 정보를 가져오는 데 실패했습니다';
        addLog(`라우트 오류: ${errorMsg}`);
        return NextResponse.json(
          { error: errorMsg, logs: operationLogs },
          { status: 500 }
        );
    }
    
    addLog('라우트 정보 수신 완료');

    // 트랜잭션 서명
    addLog('트랜잭션 서명 중...');
    const swapTransactionBuf = Buffer.from(
        route.data.raw_tx.swapTransaction,
        'base64'
    );
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);
    const signedTx = Buffer.from(transaction.serialize()).toString('base64');
    addLog('트랜잭션 서명 완료');

    // 트랜잭션 제출
    addLog('서명된 트랜잭션 제출 중...');
    let res = await fetch(
        `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signed_tx: signedTx }),
        }
    );
    res = await res.json();
    
    if (res.code !== 0) {
        const errorMsg = res.msg || '트랜잭션 제출에 실패했습니다';
        addLog(`트랜잭션 제출 오류: ${errorMsg}`);
        return NextResponse.json(
          { error: errorMsg, logs: operationLogs },
          { status: 500 }
        );
    }
    
    addLog('트랜잭션이 성공적으로 제출되었습니다');

    // 트랜잭션 상태 확인
    const hash = res.data.hash;
    const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;
    let finalStatus = null;
    addLog(`트랜잭션 해시: ${hash}`);
    addLog(`Solscan URL: ${SOLSCAN_URL}${hash}`);
    addLog('트랜잭션 상태 확인 중...');

    while (true) {
        const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
        let status = await fetch(statusUrl);
        status = await status.json();
        
        if (status.code !== 0) {
            const errorMsg = status.msg || '상태 확인에 실패했습니다';
            addLog(`상태 확인 오류: ${errorMsg}`);
            finalStatus = { error: errorMsg, hash };
            break;
        }

        if (status.data.success === true) {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // 초 단위로 변환
            addLog('트랜잭션이 성공적으로 처리되었습니다!');
            addLog(`트랜잭션 처리 시간: ${duration.toFixed(2)}초`);
            
            // 잠시 대기 후 잔액 업데이트
            addLog('최종 잔액 확인 중...');
            await sleep(2000);
            
            // 스왑 후 잔액 조회
            const afterBalances = {
              inputToken: await getTokenBalance(walletAddress, inputToken),
              outputToken: await getTokenBalance(walletAddress, outputToken)
            };
            
            const inputDiff = afterBalances.inputToken - beforeBalances.inputToken;
            const outputDiff = afterBalances.outputToken - beforeBalances.outputToken;
            
            addLog(`스왑 후 잔액 - 입력 토큰: ${afterBalances.inputToken} (${inputDiff >= 0 ? '+' : ''}${inputDiff.toFixed(6)})`);
            addLog(`스왑 후 잔액 - 출력 토큰: ${afterBalances.outputToken} (${outputDiff >= 0 ? '+' : ''}${outputDiff.toFixed(6)})`);
            
            finalStatus = { 
                success: true, 
                hash, 
                duration: duration.toFixed(2),
                solscanUrl: `${SOLSCAN_URL}${hash}`,
                walletAddress: walletAddress,
                balances: {
                    before: beforeBalances,
                    after: afterBalances,
                    diff: {
                        inputToken: inputDiff,
                        outputToken: outputDiff
                    }
                }
            };
            break;
        }

        if (status.data.expired === true) {
            addLog('트랜잭션이 만료되었습니다.');
            finalStatus = { error: '트랜잭션이 만료되었습니다', hash };
            break;
        }

        addLog('트랜잭션 처리 중...');
        await sleep(1000);
    }

    return NextResponse.json({
      ...finalStatus || { error: '알 수 없는 오류' },
      logs: operationLogs,
      walletAddress: walletAddress
    });

  } catch (error) {
    addLog(`오류 발생: ${error.message}`);
    console.error('Error in swap:', error);
    return NextResponse.json(
      { error: error.message, logs: operationLogs },
      { status: 500 }
    );
  }
}