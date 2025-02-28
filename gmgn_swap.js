import { Wallet } from '@project-serum/anchor';
import {
    Connection,
    Keypair,
    VersionedTransaction,
    LAMPORTS_PER_SOL,
    PublicKey
} from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import ComputeBudgetProgram from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import readline from 'readline';

const SOL = 'So11111111111111111111111111111111111111112'
const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'

const API_HOST = 'https://gmgn.ai';
const SOLSCAN_URL = 'https://solscan.io/tx/';
const slippage = 3;
const fee = 0; // SOL 단위, 최소 0.002 SOL (Anti-MEV 사용시)

// 토큰 주소 매핑
const TOKEN_ADDRESSES = {
    'SOL': SOL,
    'WIF': WIF,
    // 필요한 다른 토큰들 추가 가능
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 토큰 정보 가져오기 함수 수정
async function getTokenDecimals(tokenAddress) {
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const mintPublicKey = new PublicKey(tokenAddress);
    
    try {
        const tokenInfo = await connection.getAccountInfo(mintPublicKey);
        
        if (!tokenInfo) {
            throw new Error('토큰 계정을 찾을 수 없습니다.');
        }
        
        if (!tokenInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            throw new Error('이 주소는 SPL 토큰이 아닙니다.');
        }
        
        return tokenInfo.data[44];
    } catch (error) {
        console.error('토큰 정보를 가져오는 중 오류 발생:', error);
        throw error;
    }
}

async function getUserInput(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
        });
    });
}

async function main() {
    const startTime = Date.now();

    // 입력 토큰 선택
    const inputTokenTicker = await getUserInput('입력 토큰을 입력하세요 (예: SOL, WIF): ');
    const inputToken = TOKEN_ADDRESSES[inputTokenTicker.toUpperCase()];
    if (!inputToken) {
        console.error('지원하지 않는 토큰입니다.');
        rl.close();
        return;
    }

    // 출력 토큰 선택
    const outputTokenTicker = await getUserInput('출력 토큰을 입력하세요 (예: SOL, WIF): ');
    const outputToken = TOKEN_ADDRESSES[outputTokenTicker.toUpperCase()];
    if (!outputToken) {
        console.error('지원하지 않는 토큰입니다.');
        rl.close();
        return;
    }

    // 스왑할 토큰 수량 입력
    const inputAmount = parseFloat(await getUserInput('스왑할 토큰의 수량을 입력하세요: '));
    if (isNaN(inputAmount) || inputAmount <= 0) {
        console.error('올바른 수량을 입력해주세요.');
        rl.close();
        return;
    }

    // 입력 토큰의 decimal 정보 직접 가져오기
    const decimal = await getTokenDecimals(inputToken);
    const amount = (inputAmount * Math.pow(10, decimal)).toString();
    
    // 주의: 실제 환경에서는 비밀 키를 안전하게 관리해야 합니다.
    const wallet = new Wallet(
        Keypair.fromSecretKey(
            bs58.decode(
                process.env.PRIVATE_KEY
            )
        )
    );
    console.log(`지갑 주소: ${wallet.publicKey.toString()}`);

    // 견적 및 서명되지 않은 트랜잭션 가져오기
    const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${inputToken}&token_out_address=${outputToken}&in_amount=${amount}&from_address=${wallet.publicKey.toString()}&slippage=${slippage}&fee=${fee}`;
    let route = await fetch(quoteUrl);
    route = await route.json();
    // console.log('라우트 정보:', route);

    if (route.code !== 0) {
        console.error('라우트 정보를 가져오는 데 실패했습니다:', route.msg);
        return;
    }

    // 트랜잭션 서명
    const swapTransactionBuf = Buffer.from(
        route.data.raw_tx.swapTransaction,
        'base64'
    );
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet.payer]);
    const signedTx = Buffer.from(transaction.serialize()).toString('base64');
    console.log('서명된 트랜잭션:', signedTx);

    // 트랜잭션 제출
    let res = await fetch(
        `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signed_tx: signedTx }),
        }
    );
    res = await res.json();
    console.log('트랜잭션 제출 결과:', res);

    if (res.code !== 0) {
        console.error('트랜잭션 제출에 실패했습니다:', res.msg);
        return;
    }

    // 트랜잭션 상태 확인
    const hash = res.data.hash;
    const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;

    while (true) {
        const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
        let status = await fetch(statusUrl);
        status = await status.json();
        console.log('트랜잭션 상태:', status);

        if (status.code !== 0) {
            console.error('상태 확인에 실패했습니다:', status.msg);
            break;
        }

        if (status.data.success === true) {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // 초 단위로 변환
            console.log('트랜잭션이 성공적으로 처리되었습니다!');
            console.log(`Solscan에서 트랜잭션 확인: ${SOLSCAN_URL}${hash}`);
            console.log(
                `트랜잭션 요청부터 확인까지 걸린 시간: ${duration.toFixed(2)}초`
            );
            break;
        }

        if (status.data.expired === true) {
            console.log('트랜잭션이 만료되었습니다. 다시 시도해주세요.');
            break;
        }

        await sleep(1000);
    }

    // 프로그램 종료 시 readline 인터페이스 닫기
    rl.close();
}

main().catch(console.error);
