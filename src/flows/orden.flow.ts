import { addKeyword } from "@builderbot/bot";
import axios from "axios";
import fs from "fs";
import { clearHistory } from "../utils/handleHistory";
import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const flowOrden = addKeyword("orden")
  .addAnswer(`📝`)
  .addAction(async (_, { flowDynamic }) => {
    await flowDynamic("Ok, voy a pedirte unos datos para agendar");
    await flowDynamic("¿Cuál es tu nombre?");
  })

  .addAction(
    { capture: true },
    async (ctx, { state, flowDynamic, endFlow }) => {
      try {
        if (ctx.body.toLowerCase().includes("cancelar")) {
          return endFlow(`¿Cómo puedo ayudarte?`);
        }
        await state.update({ name: ctx.body });
        await flowDynamic(`Última pregunta, ¿Cuál es tu email?`);
      } catch (err) {
        console.log(`[ERROR]:`, err);
      }
      clearHistory(state);
    }
  )
  .addAction(
    { capture: true },
    async (ctx, { state, flowDynamic, fallBack, endFlow }) => {
      if (!ctx.body.includes("@")) {
        return fallBack(`Debes ingresar un correo correcto`);
      }

      // Capturamos el email y otros datos necesarios
      await state.update({ email: ctx.body });

      // Datos adicionales que podrías querer enviar
      const nombre = ctx.pushName;
      const email = state.get("email");
      const telefono = "593983279469"; // Puedes capturar esto también si es necesario
      const total = 100; // Puedes calcular esto dinámicamente
      const cliente_id = "666a5aebb0caadd7a343e938"; // Cliente ID, puede venir del estado o de otro lado

      // Datos para enviar a la API
      const pedidoData = {
        nombre,
        email,
        telefono,
        total,
        cliente_id,
      };

      try {
        // Enviar datos a la API para crear el pedido
        const response = await axios.post(
          "https://api-catalogo-pdf.onrender.com/api/pedidos",
          pedidoData,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        // Asegúrate de que pdfPath solo contiene el nombre del archivo
        const fullPath = response.data.pdfPath;
        const pdfPath = fullPath.split("\\").pop().split("/").pop(); // Extrae solo el nombre del archivo
        const pdfUrl = `https://api-catalogo-pdf.onrender.com/api/pdfs/${pdfPath}`;
        console.log("Pedido creado:", response.data);
        console.log("URL del PDF:", pdfUrl);

        // Descargar el PDF
        const pdfResponse = await axios.get(pdfUrl, {
          responseType: "arraybuffer",
        });
        const pdfBuffer = Buffer.from(pdfResponse.data, "binary");

        // Guardar el archivo temporalmente
        const tempFilePath = path.join(__dirname, `${pdfPath}`);
        fs.writeFileSync(tempFilePath, pdfBuffer);

        ///--------------------------------------------------------------------------///
        // Enviar la URL del PDF al usuario
        //await flowDynamic(
        //  `Tu pedido ha sido creado. Puedes descargar el PDF desde el siguiente enlace: ${pdfUrl}`
        //);
        console.log("Pdf generado:", tempFilePath);
        // Enviar el archivo PDF adjunto
        await flowDynamic([{ body:"Tu pedido ha sido creado.🍜",media:tempFilePath }]);


        // Eliminar el archivo temporal después de enviarlo
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
