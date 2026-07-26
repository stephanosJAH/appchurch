import { DirectorioList } from "../components/Directorio";

// Ruta standalone del directorio (accedida desde el acceso rápido "Directorio").
// La misma lista vive embebida en la pestaña "Nosotros" del feed.
export default function Directorio() {
  return <DirectorioList />;
}
