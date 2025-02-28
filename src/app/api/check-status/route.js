import { NextResponse } from 'next/server';

const API_HOST = 'https://gmgn.ai';

export async function POST(request) {
  try {
    const { hash, lastValidBlockHeight } = await request.json();
    
    const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
    const statusResponse = await fetch(statusUrl);
    const status = await statusResponse.json();

    if (status.code !== 0) {
      return NextResponse.json({ error: status.msg }, { status: 400 });
    }

    return NextResponse.json({
      success: status.data.success === true,
      expired: status.data.expired === true,
      status: status.data
    });

  } catch (error) {
    console.error('Error checking transaction status:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 