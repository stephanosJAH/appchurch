import { DirectorioList } from "../components/Directorio";
import { Screen } from "../components/ui";

// Ruta standalone del directorio (accedida desde el acceso rápido "Directorio").
// La misma lista vive embebida en la pestaña "Nosotros" del feed.
export default function Directorio() {
  return (
    <Screen>
      <DirectorioList />
    </Screen>
  );
}
