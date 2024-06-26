import { addKeyword, EVENTS } from "@builderbot/bot";
import { generateTimer } from "../utils/generateTimer";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { getFullCurrentDate } from "src/utils/currentDate";
import { pdfQuery } from "src/services/pdf";
import { G4F } from "g4f";
import { getItem } from "src/services/api/items.service";

const g4f = new G4F();

const PROMPT_SELLER = `Como experto en ventas con aproximadamente 15 años de experiencia en embudos de ventas y generación de leads, tu tarea es mantener una conversación agradable, responder a las preguntas del cliente sobre nuestros productos y, finalmente, guiarlos a realizar una orden. Tus respuestas deben basarse únicamente en el contexto proporcionado:

### DÍA ACTUAL
{CURRENT_DAY}

### HISTORIAL DE CONVERSACIÓN (Cliente/Vendedor)
{HISTORY}

### BASE DE DATOS
{DATABASE}

Para proporcionar respuestas más útiles, puedes utilizar la información proporcionada en la base de datos. El contexto es la única información que tienes. Ignora cualquier cosa que no esté relacionada con el contexto.

### EJEMPLOS DE RESPUESTAS IDEALES:

- buenas bienvenido a..
- un gusto saludarte en..
- por supuesto tenemos eso y ...

### INTRUCCIONES
- Mantén un tono profesional y siempre responde en primera persona.
- NO ofrescas promociones que no existe en la BASE DE DATOS
- NO respondas con saludo
- Respuestas cortas ideales para enviar por whatsapp con emojis.

Respuesta útil adecuadas para enviar por WhatsApp (en español):`


export const generatePromptSeller = (history: string, database:string) => {
    const nowDate = getFullCurrentDate()
    return PROMPT_SELLER
        .replace('{HISTORY}', history)
        .replace('{CURRENT_DAY}', nowDate)
        .replace('{DATABASE}', database)
};

const flowSeller = addKeyword(EVENTS.ACTION)
    .addAnswer(`⏱️`)
    .addAction(async (ctx, { state, flowDynamic, }) => {
        try {
            const text = ctx.body;
            const history = getHistoryParse(state)
            const dataBase = await getItem()
            const databaseString = JSON.stringify(dataBase); 
            console.log({dataBase})
            const promptInfo = generatePromptSeller(history, databaseString)


             // Crear los mensajes para la API de chat
          const messages = [
            { role: "system", content: "Eres un asistente personal" },
            { role: "assistant", content: promptInfo },
           
          ];

          const options = {
            model: "gpt-4",
            debug: true,
          };
           
          // Obtener la respuesta del bot
          const response = await g4f.chatCompletion(messages,options);
          console.log(`${new Date()}\nPregunta: ${text} \nRespuesta: ${response}`);


            await handleHistory({ content: dataBase, role: 'assistant' }, state)
            const chunks = response.split(/(?<!\d)\.\s+/g);
            for (const chunk of chunks) {
                await flowDynamic([{ body: chunk.trim(), delay: generateTimer(150, 250) }]);
            }
        } catch (err) {
            console.log(`[ERROR]:`, err)
            return
        }
    })

export { flowSeller }