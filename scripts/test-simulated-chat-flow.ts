import { UserProfile, Session } from '../lib/conversation/types';
import { runStreamingChat } from '../lib/ai/conversationOrchestrator';
import { evaluateProfileCompleteness } from '../lib/conversation/profileCompleteness';

async function runTest() {
  const messages = ["vorrei aprire un bnb in sicilia"];
  let profile: any = {};
  let history: any[] = [];
  
  for (const msg of messages) {
      console.log(`\n\n--- TURN: ${msg} ---`);
      const generator = runStreamingChat(msg, profile, history);
      let outputMeta;
      let text = '';
      for await (const chunk of generator) {
          if (chunk.type === 'metadata') {
              outputMeta = chunk.content;
          } else if (chunk.type === 'text') {
              text += chunk.content;
              process.stdout.write(chunk.content);
          }
      }
      console.log(`\n\n[ACTION]:`, (outputMeta as any)?.finalAction);
      console.log(`[PROFILE UPDATE]:`, (outputMeta as any)?.mergedProfile);
      console.log(`[COMPLETENESS DEBU]:`, evaluateProfileCompleteness((outputMeta as any)?.mergedProfile).missingSignals);
      console.log(`[NEXT PRIORITY FIELD]:`, evaluateProfileCompleteness((outputMeta as any)?.mergedProfile).nextPriorityField);
      
      profile = (outputMeta as any)?.mergedProfile;
      history.push({ role: 'user', text: msg });
      history.push({ role: 'assistant', text: text });
  }
}

runTest().catch(console.error);
