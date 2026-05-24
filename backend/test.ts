import { Ollama } from '@langchain/ollama';

async function test() {
  console.log("Starting...");
  const ollama = new Ollama({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'mistral'
  });
  console.log("Streaming...");
  try {
    const stream = await ollama.stream("selam");
    for await (const chunk of stream) {
      console.log("Chunk:", chunk);
    }
    console.log("Done");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
