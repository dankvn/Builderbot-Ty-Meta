import { addKeyword, EVENTS, createFlow, createProvider, MemoryDB, createBot } from '@builderbot/bot';
import { MetaProvider } from '@builderbot/provider-meta';
import { format, addMinutes, parse, isWithinInterval } from 'date-fns';
import { G4F } from 'g4f';
import axios from 'axios';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs$1 from 'fs/promises';
import Replicate from 'replicate';

const handleHistory = async (inside, _state) => {
    const history = _state.get('history') ?? [];
    history.push(inside);
    await _state.update({ history });
};
const getHistoryParse = (_state, k = 15) => {
    const history = _state.get('history') ?? [];
    const limitHistory = history.slice(-k);
    return limitHistory.reduce((prev, current) => {
        const msg = current.role === 'user' ? `Customer: "${current.content}"` : `\nSeller: "${current.content}"\n`;
        prev += msg;
        return prev;
    }, ``);
};
const clearHistory = async (_state) => {
    _state.clear();
};

var conversationalLayer = async ({ body }, { state, }) => {
    await handleHistory({ content: body, role: 'user' }, state);
};

function generateTimer(min, max) {
    const numSal = Math.random();
    const numeroAleatorio = Math.floor(numSal * (max - min + 1)) + min;
    return numeroAleatorio;
}

const getFullCurrentDate = () => {
    const currentD = new Date();
    const formatDate = format(currentD, 'yyyy/MM/dd HH:mm');
    const day = format(currentD, 'EEEE');
    return [
        formatDate,
        day,
    ].join(' ');
};

const getItem = async () => {
    try {
        const response = await axios.get('https://api-catalogo-pdf.onrender.com/api/productos/');
        return response.data;
    }
    catch (error) {
        console.error('Error al obtener productos:', error);
        throw error;
    }
};

const g4f$4 = new G4F();
const PROMPT_SELLER$2 = `Como experto en ventas con aproximadamente 15 años de experiencia en embudos de ventas y generación de leads, tu tarea es mantener una conversación agradable, responder a las preguntas del cliente sobre nuestros productos y, finalmente, guiarlos a realizar una orden. Tus respuestas deben basarse únicamente en el contexto proporcionado:

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

Respuesta útil adecuadas para enviar por WhatsApp (en español):`;
const generatePromptSeller$2 = (history, database) => {
    const nowDate = getFullCurrentDate();
    return PROMPT_SELLER$2
        .replace('{HISTORY}', history)
        .replace('{CURRENT_DAY}', nowDate)
        .replace('{DATABASE}', database);
};
const flowSeller = addKeyword(EVENTS.ACTION)
    .addAnswer(`⏱️`)
    .addAction(async (ctx, { state, flowDynamic, }) => {
    try {
        const text = ctx.body;
        const history = getHistoryParse(state);
        const dataBase = await getItem();
        const databaseString = JSON.stringify(dataBase);
        console.log({ dataBase });
        const promptInfo = generatePromptSeller$2(history, databaseString);
        const messages = [
            { role: "system", content: "Eres un asistente personal" },
            { role: "assistant", content: promptInfo },
        ];
        const options = {
            model: "gpt-4",
            debug: true,
        };
        const response = await g4f$4.chatCompletion(messages, options);
        console.log(`${new Date()}\nPregunta: ${text} \nRespuesta: ${response}`);
        await handleHistory({ content: dataBase, role: 'assistant' }, state);
        const chunks = response.split(/(?<!\d)\.\s+/g);
        for (const chunk of chunks) {
            await flowDynamic([{ body: chunk.trim(), delay: generateTimer(150, 250) }]);
        }
    }
    catch (err) {
        console.log(`[ERROR]:`, err);
        return;
    }
});

const MAKE_ADD_TO_CALENDAR = process.env.MAKE_ADD_TO_CALENDAR ?? '';
const MAKE_GET_FROM_CALENDAR = process.env.MAKE_GET_FROM_CALENDAR ?? '';
const CHATPDF_API = process.env.CHATPDF_API ?? '';
const CHATPDF_KEY = process.env.CHATPDF_KEY ?? '';
const CHATPDF_SRC = process.env.CHATPDF_SRC ?? '';
process.env.DURATION_MEET ?? '';

const getCurrentCalendar = async () => {
    const dataCalendarApi = await fetch(MAKE_GET_FROM_CALENDAR);
    const json = await dataCalendarApi.json();
    console.log({ json });
    const list = json.filter(({ date, name }) => !!date && !!name).reduce((prev, current) => {
        prev.push(current.date);
        return prev;
    }, []);
    return list;
};
const appToCalendar = async (payload) => {
    try {
        const dataApi = await fetch(MAKE_ADD_TO_CALENDAR, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload)
        });
        return dataApi;
    }
    catch (err) {
        console.log(`error: `, err);
    }
};

const DURATION_MEET$1 = process.env.DURATION_MEET ?? 45;
const flowConfirm = addKeyword(EVENTS.ACTION)
    .addAction(async (_, { flowDynamic }) => {
    await flowDynamic("Ok, voy a pedirte unos datos para agendar");
    await flowDynamic("¿Cual es tu nombre?");
})
    .addAction({ capture: true }, async (ctx, { state, flowDynamic, endFlow }) => {
    try {
        if (ctx.body.toLocaleLowerCase().includes("cancelar")) {
            clearHistory(state);
            return endFlow(`¿Como puedo ayudarte?`);
        }
        await state.update({ name: ctx.body });
        await flowDynamic(`Ultima pregunta ¿Cual es tu email?`);
    }
    catch (err) {
        console.log(`[ERROR]:`, err);
    }
})
    .addAction({ capture: true }, async (ctx, { state, flowDynamic, fallBack }) => {
    if (!ctx.body.includes("@")) {
        return fallBack(`Debes ingresar un mail correcto`);
    }
    const dateObject = {
        name: state.get("name"),
        email: ctx.body,
        startDate: format(state.get("desiredDate"), "yyyy/MM/dd HH:mm:ss"),
        endData: format(addMinutes(state.get("desiredDate"), +DURATION_MEET$1), "yyyy/MM/dd HH:mm:ss"),
        phone: ctx.from,
    };
    await appToCalendar(dateObject);
    clearHistory(state);
    await flowDynamic("Listo! agendado Buen dia");
});

const DURATION_MEET = process.env.DURATION_MEET ?? 45;
const g4f$3 = new G4F();
const PROMPT_FILTER_DATE = `
### Contexto
Eres un asistente de inteligencia artificial. Tu propósito es determinar la fecha y hora que el cliente quiere, en el formato yyyy/MM/dd HH:mm:ss.


### Fecha y Hora Actual:
{CURRENT_DAY}

### Registro de Conversación:
{HISTORY}

### INSTRUCIONES
-Evita agendar los domingos y fuera del horario 10:00 a 19:00.
- NO Agendar en horario de almuezo 13:00 a 14:00.



Asistente: "{respuesta en formato (yyyy/MM/dd HH:mm:ss)}"
`;
const generatePromptFilter = (history) => {
    const nowDate = getFullCurrentDate();
    const mainPrompt = PROMPT_FILTER_DATE.replace("{HISTORY}", history).replace("{CURRENT_DAY}", nowDate);
    return mainPrompt;
};
const flowSchedule = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
    await flowDynamic("Dame un momento para consultar la agenda...");
    const history = getHistoryParse(state);
    const list = await getCurrentCalendar();
    const listParse = list
        .map((d) => parse(d, "yyyy/MM/dd HH:mm:ss", new Date()))
        .map((fromDate) => ({
        fromDate,
        toDate: addMinutes(fromDate, +DURATION_MEET),
    }));
    const promptFilter = generatePromptFilter(history);
    const messages = [
        { role: "system", content: "Eres un asistente personal" },
        { role: "assistant", content: promptFilter },
    ];
    const options = {
        model: "gpt-4",
        debug: true,
    };
    const response = await g4f$3.chatCompletion(messages, options);
    console.log(`${new Date()}\nRespuesta de G4F: ${response}`);
    const date = response.trim();
    const desiredDate = parse(date, "yyyy/MM/dd HH:mm:ss", new Date());
    const isDateAvailable = listParse.every(({ fromDate, toDate }) => !isWithinInterval(desiredDate, { start: fromDate, end: toDate }));
    if (!isDateAvailable) {
        const m = "Lo siento, esa hora ya está reservada. ¿Alguna otra fecha y hora?";
        await flowDynamic(m);
        await handleHistory({ content: m, role: "assistant" }, state);
        await state.update({ desiredDate: null });
        return;
    }
    const formattedDateFrom = format(desiredDate, "hh:mm a");
    const formattedDateTo = format(addMinutes(desiredDate, +DURATION_MEET), "hh:mm a");
    const message = `¡Perfecto! Tenemos disponibilidad de ${formattedDateFrom} a ${formattedDateTo} el día ${format(desiredDate, "dd/MM/yyyy")}. ¿Confirmo tu reserva? *si*`;
    await handleHistory({ content: message, role: "assistant" }, state);
    await state.update({ desiredDate });
    const chunks = message.split(/(?<!\d)\.\s+/g);
    for (const chunk of chunks) {
        await flowDynamic([
            { body: chunk.trim(), delay: generateTimer(150, 250) },
        ]);
    }
})
    .addAction({ capture: true }, async ({ body }, { gotoFlow, flowDynamic, state }) => {
    if (body.toLowerCase().includes("si"))
        return gotoFlow(flowConfirm);
    await flowDynamic("¿Alguna otra fecha y hora?");
    await state.update({ desiredDate: null });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const g4f$2 = new G4F();
const PROMPT_SELLER$1 = `
### Contexto
Eres un asistente de inteligencia artificial. Tu propósito es capturar los productos que el cliente mencione.


### Registro de Conversación:
{HISTORY}

### BASE DE DATOS
{DATABASE}
Para proporcionar respuestas más útiles, puedes utilizar la información proporcionada en la base de datos. El contexto es la única información que tienes. Ignora cualquier cosa que no esté relacionada con el contexto.

### INSTRUCIONES
- Captura cada producto que el cliente mencione mas la cantidad.
- Responde con este formato :
 {Nombre del producto}:{$precio_unitario}*{cantidad}.
  Resultado Final:
Total por  {nombre del producto}: $Total_por_productos. 
Total por  {nombre del producto}: $Total_por_productos.
Total por todos los productos: Suma total.

Asistente: "{respuesta en formato (nombre del producto) ($precio_unitario)}"
`;
const generatePromptSeller$1 = (history, database) => {
    const nowDate = getFullCurrentDate();
    return PROMPT_SELLER$1.replace("{HISTORY}", history)
        .replace("{CURRENT_DAY}", nowDate)
        .replace('{DATABASE}', database);
};
const parseProducts = (productsString) => {
    const productsArray = productsString.split("\n").filter(Boolean);
    const parsedProducts = [];
    for (let i = 0; i < productsArray.length; i++) {
        const line = productsArray[i];
        if (line.includes(':') && line.includes('*')) {
            const [namePart, rest] = line.split(':');
            const [pricePart, quantityPart] = rest.split('*');
            const name = namePart.trim();
            const price = parseFloat(pricePart.replace('$', '').trim());
            const quantity = parseInt(quantityPart.trim(), 10);
            parsedProducts.push({
                nombre: name,
                cantidad: quantity,
                precio_unitario: price,
            });
        }
    }
    return parsedProducts;
};
const flowOrden = addKeyword(EVENTS.ACTION)
    .addAnswer(`📝`)
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
    await flowDynamic("Procesando tu orden ✍");
    const history = getHistoryParse(state);
    const database = await getItem();
    const databaseString = JSON.stringify(database);
    console.log({ database });
    const promptFilter = generatePromptSeller$1(history, databaseString);
    const text = ctx.body;
    const messages = [
        { role: "system", content: "Eres un experto en matematicas" },
        { role: "assistant", content: promptFilter },
        { role: "user", content: text },
    ];
    const options = {
        model: "gpt-4",
        debug: true,
    };
    const response = await g4f$2.chatCompletion(messages, options);
    console.log(`${new Date()}\nRespuesta de G4F: ${response}`);
    const product = response.trim();
    if (!product) {
        await flowDynamic("No se pudo capturar el producto. ¿Puede intentarlo de nuevo?");
        return;
    }
    const parsedProduct = parseProducts(product);
    const currentProducts = state.get('products') || [];
    currentProducts.push(...parsedProduct);
    await handleHistory({ content: `Lista de productos:${product}.`, role: "assistant" }, state);
    await state.update({ products: currentProducts });
    await flowDynamic(`Lista de productos:\n ${product}.\n ¿Desea agregar otro producto? (si/no)`);
})
    .addAction({ capture: true }, async ({ body }, { gotoFlow, flowDynamic, state }) => {
    if (body.toLowerCase().includes("si"))
        return gotoFlow(flowOrden);
    const products = state.get('products').map(product => `${product.nombre} (Cantidad: ${product.cantidad}, Precio Unitario: $${product.precio_unitario})`).join(", ");
    await flowDynamic(`Orden finalizada. Los productos ingresados son: ${products}\n Quieres *confirma* tu pedido`);
})
    .addAction({ capture: true }, async (ctx, { flowDynamic, state }) => {
    await state.update({ name: ctx.body });
    await flowDynamic("Dime tu email...");
})
    .addAction({ capture: true }, async (ctx, { state, fallBack }) => {
    if (!ctx.body.includes("@")) {
        return fallBack("Debes ingresar un correo correcto.");
    }
    await state.update({ email: ctx.body });
})
    .addAction(async (ctx, { state, flowDynamic }) => {
    const myState = state.getMyState();
    const nombre = ctx.pushName;
    const email = myState.email;
    const telefono = ctx.from;
    const estado = "pendiente";
    const productos = myState.products;
    const pedidoData = {
        nombre,
        email,
        telefono,
        estado,
        productos
    };
    try {
        console.log("Pedido a enviar:", JSON.stringify(pedidoData, null, 2));
        const response = await axios.post(" https://api-catalogo-pdf.onrender.com/api/pedidos", pedidoData, {
            headers: {
                "Content-Type": "application/json",
            },
        });
        const fullPath = response.data.pdfPath;
        const pdfPath = fullPath.split("\\").pop().split("/").pop();
        const pdfUrl = `https://api-catalogo-pdf.onrender.com/api/pdfs/${pdfPath}`;
        console.log("Pedido creado:", JSON.stringify(response.data, null, 2));
        console.log("URL del PDF:", pdfUrl);
        const pdfResponse = await axios.get(pdfUrl, {
            responseType: "arraybuffer",
        });
        const pdfBuffer = Buffer.from(pdfResponse.data, "binary");
        const tempFilePath = path.join(__dirname, `${pdfPath}`);
        fs.writeFileSync(tempFilePath, pdfBuffer);
        await flowDynamic([
            { body: "Tu pedido ha sido creado.🍜", media: tempFilePath },
        ]);
        fs.unlinkSync(tempFilePath);
    }
    catch (error) {
        console.error("Error al crear el pedido:", error);
        await flowDynamic("Hubo un error al crear tu pedido. Por favor, inténtalo de nuevo más tarde.");
    }
    clearHistory(state);
});

const g4f$1 = new G4F();
const PROMPT_DISCRIMINATOR = `### Historial de Conversación (Vendedor/Cliente) ###
{HISTORY}

### Intenciones del Usuario ###

**HABLAR**: Selecciona esta acción si el cliente parece querer hacer una pregunta o necesita más información de productos.
**PROGRAMAR**: Selecciona esta acción si el cliente muestra intención de programar una cita.
**COMPRAR**: Selecciona esta acción si el cliente muestra intención de comprar un producto.

### Instrucciones ###

Por favor, clasifica la siguiente conversación según la intención del usuario.`;
var mainLayer = async (ctx, { state, gotoFlow }) => {
    const history = getHistoryParse(state);
    const prompt = PROMPT_DISCRIMINATOR;
    const text = ctx.body;
    console.log(prompt.replace('{HISTORY}', history));
    const messages = [
        { role: "system", content: "Eres un asistente personal" },
        { role: "assistant", content: prompt },
        { role: "user", content: text },
    ];
    const options = {
        model: "gpt-4",
        debug: true,
        retry: {
            times: 3,
            condition: (text) => {
                const words = text.split(" ");
                return words.length > 10;
            },
        },
        output: (text) => {
            return text + " ✍";
        },
    };
    const response = await g4f$1.chatCompletion(messages, options);
    console.log(`${new Date()}\nPregunta: ${text} \nRespuesta: ${response}`);
    await state.get(response);
    console.log({ response });
    if (response.includes('HABLAR'))
        return gotoFlow(flowSeller);
    if (response.includes('PROGRAMAR'))
        return gotoFlow(flowSchedule);
    if (response.includes('COMPRAR'))
        return gotoFlow(flowOrden);
};

const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(conversationalLayer)
    .addAction(mainLayer);

const pdfQuery = async (query) => {
    try {
        const dataApi = await fetch(CHATPDF_API, {
            method: 'POST',
            headers: {
                'x-api-key': CHATPDF_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "sourceId": CHATPDF_SRC,
                "messages": [
                    {
                        "role": "user",
                        "content": query
                    }
                ]
            })
        });
        const response = await dataApi.json();
        return response.content;
    }
    catch (e) {
        console.log(e);
        return 'ERROR';
    }
};

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});
const transcribeAudio = async (filePath) => {
    try {
        const buffer = await fs$1.readFile(filePath, { encoding: "base64" });
        const input = {
            audio: `data:audio/wav;base64,${buffer}`,
        };
        const output = await replicate.run("openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2", { input });
        console.log(`🤖 Full Transcription Result: ${JSON.stringify(output, null, 2)}`);
        return output;
    }
    catch (error) {
        console.error("Error transcribing audio:", error);
        return null;
    }
};

const PROMPT_SELLER = `Como experto en ventas con aproximadamente 15 años de experiencia en embudos de ventas y generación de leads, tu tarea es mantener una conversación agradable, responder a las preguntas del cliente sobre nuestros productos y, finalmente, guiarlos para reservar una cita. Tus respuestas deben basarse únicamente en el contexto proporcionado:

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

Respuesta útil adecuadas para enviar por WhatsApp (en español):`;
const generatePromptSeller = (history, database) => {
    const nowDate = getFullCurrentDate();
    return PROMPT_SELLER.replace("{HISTORY}", history)
        .replace("{CURRENT_DAY}", nowDate)
        .replace("{DATABASE}", database);
};
const g4f = new G4F();
const flowVoiceNote = addKeyword(EVENTS.VOICE_NOTE)
    .addAnswer("Dame un momento para escucharte...🙉")
    .addAction(async (ctx, { provider, state, flowDynamic }) => {
    const tempDir = "./tmp";
    try {
        await fs$1.mkdir(tempDir, { recursive: true });
        const localPath = await provider.saveFile(ctx, { path: tempDir });
        if (!localPath) {
            console.log("Error: La ruta del archivo es inválida o no se pudo guardar el archivo.");
            return;
        }
        console.log(`🤖 Fin voz a texto....[TEXT]: ${localPath}`);
        const transcriptionResult = await transcribeAudio(localPath);
        if (transcriptionResult) {
            const transcribedText = transcriptionResult.transcription;
            console.log(`🤖 Transcribed Text: ${transcribedText}`);
            try {
                const history = getHistoryParse(state);
                const dataBase = await pdfQuery(transcribedText);
                console.log({ dataBase });
                const promptInfo = generatePromptSeller(history, dataBase);
                const messages = [
                    { role: "system", content: "Eres un asistente personal" },
                    { role: "assistant", content: promptInfo },
                ];
                const options = {
                    model: "gpt-4",
                    debug: true,
                };
                const response = await g4f.chatCompletion(messages, options);
                await handleHistory({ content: response, role: "assistant" }, state);
                const chunks = dataBase.split(/(?<!\d)\.\s+/g);
                console.log(`${new Date()}\nPregunta: ${transcribedText} \nRespuesta: ${dataBase}`);
                for (const chunk of chunks) {
                    await flowDynamic([
                        { body: chunk.trim(), delay: generateTimer(150, 250) },
                    ]);
                }
            }
            catch (err) {
                console.log(`[ERROR]:`, err);
                return;
            }
        }
        else {
            console.log("🤖 No se pudo transcribir el audio.");
        }
    }
    catch (err) {
        console.log(`[ERROR]:`, err);
    }
});

var flow = createFlow([welcomeFlow, flowSeller, flowSchedule, flowConfirm, flowVoiceNote, flowOrden]);

const PORT = process.env.PORT ?? 3009;
const main = async () => {
    const adapterProvider = createProvider(MetaProvider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v19.0'
    });
    const adapterDB = new MemoryDB();
    const { handleCtx, httpServer } = await createBot({
        flow,
        provider: adapterProvider,
        database: adapterDB,
    });
    adapterProvider.server.post('/v1/messages', handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        await bot.sendMessage(number, message, { media: urlMedia ?? null });
        return res.end('sended');
    }));
    adapterProvider.server.post('/v1/register', handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch('REGISTER_FLOW', { from: number, name });
        return res.end('trigger');
    }));
    adapterProvider.server.post('/v1/samples', handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch('SAMPLES', { from: number, name });
        return res.end('trigger');
    }));
    adapterProvider.server.post('/v1/blacklist', handleCtx(async (bot, req, res) => {
        const { number, intent } = req.body;
        if (intent === 'remove')
            bot.blacklist.remove(number);
        if (intent === 'add')
            bot.blacklist.add(number);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', number, intent }));
    }));
    httpServer(+PORT);
};
main();
