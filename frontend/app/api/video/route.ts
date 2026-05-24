import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, aspect_ratio, loop } = await req.json();
    const apiKey = process.env.LUMA_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Luma API key not configured on server' }, { status: 500 });
    }

    const res = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, aspect_ratio, loop }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
