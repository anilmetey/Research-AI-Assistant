import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const apiKey = process.env.LUMA_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Luma API key not configured on server' }, { status: 500 });
    }

    const res = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${params.id}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
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
