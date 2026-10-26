import { Alert } from "react-native";
import { useEliminarMiCuenta } from "../lib/queries/profiles";
import { Button } from "./ui";

// Exigido por la App Store (guideline 5.1.1(v)): toda cuenta creada desde la
// app se tiene que poder borrar desde la app. Va en Perfil y también en
// Pendiente, porque una cuenta sin aprobar tampoco llega a Perfil.
export function EliminarCuentaButton() {
  const eliminar = useEliminarMiCuenta();

  const ejecutar = () =>
    eliminar.mutate(undefined, {
      onError: (e: any) =>
        Alert.alert(
          "No se pudo eliminar",
          e?.message?.includes("ultimo_admin")
            ? "Sos el único administrador. Nombrá a otro antes de eliminar tu cuenta."
            : "Revisá tu conexión e intentá de nuevo."
        ),
    });

  const confirmar = () =>
    Alert.alert(
      "Eliminar mi cuenta",
      "Se borran tu usuario, tu contraseña y tu acceso a la app. No se puede deshacer.\n\n" +
        "Tu ficha en el padrón de la iglesia la sigue administrando la iglesia; si querés que " +
        "también la borren, pedíselo a un administrador.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: ejecutar },
      ]
    );

  return (
    <Button
      title="Eliminar mi cuenta"
      variant="ghost"
      icon="trash-outline"
      onPress={confirmar}
      loading={eliminar.isPending}
    />
  );
}
