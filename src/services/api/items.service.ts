import axios from 'axios';



export const getItem = async () => {
  try {
    const response = await axios.get('http://localhost:80/api/productos/');

    return response.data; // Esto devuelve los datos recibidos del servidor
  } catch (error) {
    console.error('Error al obtener productos:', error);
    throw error; // Puedes manejar el error según tus necesidades
  }
};


