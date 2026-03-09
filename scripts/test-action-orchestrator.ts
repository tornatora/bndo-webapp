import { runTwoPassChat } from '../lib/ai/conversationOrchestrator';

async function main() {
    const memory = { location: { region: 'Lazio', municipality: null }, sector: 'agricoltura' };
    const cases = [
        "Vorrei aprire un agriturismo in Puglia, mi servono 30k e ho 27 anni",
        "Vorrei sapere quali bandi ci sono per me e che cos'è il de minimis",
        "Assolutamente no, non ho ancora la P.IVA, la devo aprire",
        "Procediamo con la ricerca bandi"
    ];

    for (const text of cases) {
        console.log("------------------------");
        console.log("INPUT:", text);
        try {
            const res = await runTwoPassChat(text, memory);
            console.log("RES:", JSON.stringify(res, null, 2));
        } catch (e) {
            console.error("ERROR:", e);
        }
    }
}

main();
