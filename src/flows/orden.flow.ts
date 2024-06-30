import { addKeyword, EVENTS } from "@builderbot/bot";
import { generateTimer } from "../utils/generateTimer";
import { getHistoryParse, handleHistory } from "../utils/handleHistory";
import { getFullCurrentDate } from "src/utils/currentDate";
import { pdfQuery } from "src/services/pdf";
import { getItem } from "src/services/api/items.service";
import { G4F } from "g4f";
import axios from "axios";
import fs from "fs";
import { clearHistory } from "../utils/handleHistory";
import { fileURLToPath } from "url";
import path from "path";
import { text } from "stream/consumers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const g4f = new G4F();

const PROMPT_SELLER = `
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
 {Nombre del producto}:{$precio_unitario}*{cantidad}.
  Resultado Final:
Total por  {nombre del producto}: $Total_por_productos. 
Total por  {nombre del producto}: $Total_por_productos.
Total por todos los productos: Suma total.

Asistente: "{respuesta en formato (nombre del producto) ($precio_unitario)}"
`;

export const generatePromptSeller = (history, database) => {
  const nowDate = getFullCurrentDate();
  return PROMPT_SELLER.replace("{HISTORY}", history)
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

    const promptFilter = generatePromptSeller(history, databaseString);
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

    const response = await g4f.chatCompletion(messages, options);
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
  
  .addAction(
    { capture: true },
    async ({ body }, { gotoFlow, flowDynamic, state }) => {
      if (body.toLowerCase().includes("si")) return gotoFlow(flowOrden);

      const products = state.get('products').map(product => 
        `${product.nombre} (Cantidad: ${product.cantidad}, Precio Unitario: $${product.precio_unitario})`
      ).join(", ");
      await flowDynamic(`Orden finalizada. Los productos ingresados son: ${products}\n Quieres *confirma* tu pedido`);
       // Reset products list after confirmation
    }
  )

  .addAction(
    { capture: true },
    async (ctx, { flowDynamic, state }) => {
      await state.update({ name: ctx.body });
      await flowDynamic("Dime tu email...");
    }
  )
  .addAction(
    { capture: true },
    async (ctx, { state, fallBack }) => {
      if (!ctx.body.includes("@")) {
        return fallBack("Debes ingresar un correo correcto.");
      }
      await state.update({ email: ctx.body });
    }
  )
 
  .addAction(
    async (ctx, { state, flowDynamic }) => {
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
        console.log("Pedido a enviar:", JSON.stringify(pedidoData, null, 2)); // Agregado para verificar el formato del pedido
        const response = await axios.post(
          "http://localhost/api/pedidos",
          pedidoData,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const fullPath = response.data.pdfPath;
        const pdfPath = fullPath.split("\\").pop().split("/").pop();
        const pdfUrl = `http://localhost/api/pdfs/${pdfPath}`;
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
      } catch (error) {
        console.error("Error al crear el pedido:", error);
        await flowDynamic(
          "Hubo un error al crear tu pedido. Por favor, inténtalo de nuevo más tarde."
        );
      }

      clearHistory(state);
    }
  );

export { flowOrden };
