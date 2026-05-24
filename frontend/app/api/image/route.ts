import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const prompt = searchParams.get('prompt');
    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const seed = searchParams.get('seed');
    const model = searchParams.get('model');
    
    if (!prompt) {
      return new NextResponse('Prompt is required', { status: 400 });
    }

    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${model}`;

    const res = await fetch(url);
    
    if (!res.ok) {
      return new NextResponse('Failed to generate image', { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
