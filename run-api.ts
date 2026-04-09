import { POST } from './app/api/conversation/route';
import { NextRequest } from 'next/server';

async function run() {
  const req = new NextRequest('http://localhost:3000/api/conversation', {
      method: 'POST',
      body: JSON.stringify({
          messages: [{ id: '1', role: 'user', content: 'vorrei aprire un bnb in sicilia' }],
          userProfile: {}
      })
  });
  
  const res = await POST(req);
  console.log("Status:", res.status);
  
  if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let outputMeta = null;
      while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const str = decoder.decode(value);
          const lines = str.split('\n');
          for (const line of lines) {
             if (line.startsWith('0:')) {
                const inner = JSON.parse(line.slice(2));
                if (Array.isArray(inner) && inner.length > 0 && typeof inner[0] === 'string' && inner[0].startsWith('__META__')) {
                   outputMeta = JSON.parse(inner[0].slice(8));
                }
             }
          }
      }
      console.log("\n\nFINAL ACTION from route:", outputMeta?.finalAction);
      console.log("MISSING FIELDS:", outputMeta?.missing_fields);
  }
}
run().catch(console.error);

