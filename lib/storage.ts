import { Alert, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import { AdjuntoTipo } from "./types";

export type AdjuntoLocal = {
  uri: string;
  name: string;
  mimeType: string;
  tipo: AdjuntoTipo;
};

// Abre el selector para elegir una imagen (flyer) o un PDF.
// Devuelve null si el usuario cancela.
export async function elegirAdjunto(): Promise<AdjuntoLocal | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "application/pdf"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const mimeType = a.mimeType ?? "application/octet-stream";
  const tipo: AdjuntoTipo = mimeType.startsWith("image/") ? "imagen" : "pdf";
  return { uri: a.uri, name: a.name ?? "adjunto", mimeType, tipo };
}

// Sube el adjunto al bucket público 'adjuntos' y devuelve su URL pública.
// El bucket es público POR DISEÑO (flyers/anuncios de eventos pensados para
// difusión). Para que la URL no sea adivinable/enumerable, el nombre se genera
// con un UUID v4 (128 bits de entropía) en vez de timestamp + 6 chars base36
// (~31 bits) — hallazgo de seguridad #5.
export async function subirAdjunto(
  file: AdjuntoLocal
): Promise<{ url: string; tipo: AdjuntoTipo }> {
  const path = `${Crypto.randomUUID()}.${extensionDe(file.name, file.tipo === "pdf" ? "pdf" : "jpg")}`;
  return { url: await subirAlBucket(path, file.uri, file.mimeType), tipo: file.tipo };
}

// Sanitiza la extensión (viene del nombre elegido por el usuario): evita
// caracteres raros o "/" en el path del objeto.
function extensionDe(nombre: string, porDefecto: string): string {
  const raw = nombre.includes(".") ? nombre.split(".").pop()! : porDefecto;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || porDefecto;
}

async function subirAlBucket(path: string, uri: string, mimeType: string): Promise<string> {
  const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage
    .from("adjuntos")
    .upload(path, arraybuffer, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return supabase.storage.from("adjuntos").getPublicUrl(path).data.publicUrl;
}

/* ===================== Imagen de fondo de un ministerio ===================== */

// Una foto de celular entera pesa varios MB y se descarga cada vez que alguien
// abre el ministerio; sin un compresor en el proyecto, el corte es de tamaño.
const MAX_MB_IMAGEN = 5;

export type ImagenLocal = { uri: string; name: string; mimeType: string };

// Selector solo de imágenes. Null si el usuario cancela o la imagen es muy
// pesada (ya avisado).
export async function elegirImagen(): Promise<ImagenLocal | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (a.size != null && a.size > MAX_MB_IMAGEN * 1024 * 1024) {
    Alert.alert(
      "Imagen muy pesada",
      `Elegí una de hasta ${MAX_MB_IMAGEN} MB. Una captura o una foto en calidad reducida suele alcanzar.`
    );
    return null;
  }
  return { uri: a.uri, name: a.name ?? "imagen.jpg", mimeType: a.mimeType ?? "image/jpeg" };
}

// Va a `adjuntos/ministerios/<id>/`: la carpeta es lo que autoriza al líder a
// escribir (policies de 0033); el nombre sigue siendo un UUID, como los flyers.
export async function subirImagenMinisterio(
  ministerioId: string,
  img: ImagenLocal
): Promise<string> {
  const path = `ministerios/${ministerioId}/${Crypto.randomUUID()}.${extensionDe(img.name, "jpg")}`;
  return subirAlBucket(path, img.uri, img.mimeType);
}

// Borra la imagen anterior al reemplazarla o quitarla. Best effort: si falla,
// queda un archivo huérfano en el bucket, no un error para quien edita.
export async function borrarImagenMinisterio(url: string | null | undefined): Promise<void> {
  const path = url?.split("/object/public/adjuntos/")[1];
  if (!path?.startsWith("ministerios/")) return;
  await supabase.storage.from("adjuntos").remove([decodeURIComponent(path)]).catch(() => {});
}

/* ============================ Foto de perfil ============================ */

// El directorio pide una foto por fila: se sube chica, no la original.
const LADO_FOTO_PERFIL = 512;

// Galería con recorte cuadrado. Devuelve los bytes de un JPEG listo para subir,
// o null si cancela. Recodificarla también le saca los metadatos a la original
// (la ubicación, por ejemplo), que en un bucket público quedarían a la vista.
//
// Los bytes salen en base64 del propio manipulador y no de `fetch(uri)`: en
// Android, si `fetch` no encuentra el archivo local responde 404 con el texto
// "File not found" en vez de fallar, y ese texto se subía como si fuera la foto.
export async function elegirFotoPerfil(): Promise<ArrayBuffer | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;
  const imagen = await ImageManipulator.manipulate(res.assets[0].uri)
    .resize({ width: LADO_FOTO_PERFIL })
    .renderAsync();
  const { base64 } = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!base64) throw new Error("El manipulador no devolvió la imagen");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

// Va a `fotos_perfil/<uid>/`: la carpeta es lo que autoriza a escribir (0040).
// Devuelve el path, que es lo que se guarda en `profiles.foto_path`. Cada foto
// tiene nombre propio, así que el archivo no cambia nunca y se puede cachear.
export async function subirFotoPerfil(userId: string, foto: ArrayBuffer): Promise<string> {
  // El bucket confía en el tipo que declara quien sube: acá se miran los bytes.
  const inicio = new Uint8Array(foto, 0, Math.min(2, foto.byteLength));
  if (inicio[0] !== 0xff || inicio[1] !== 0xd8) throw new Error("La foto no es un JPEG");
  const path =`${userId}/${Crypto.randomUUID().toLowerCase()}.jpg`;
  const { error } = await supabase.storage
    .from("fotos_perfil")
    .upload(path, foto, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

// Vacía la carpeta de la cuenta, salvo `conservar`. Lista en vez de borrar un
// path conocido para llevarse también lo que haya quedado de un reemplazo
// fallido. Tira error si falla: quien llama decide si eso importa.
export async function borrarFotosPerfil(userId: string, conservar?: string | null): Promise<void> {
  const bucket = supabase.storage.from("fotos_perfil");
  const { data, error } = await bucket.list(userId);
  if (error) throw error;
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== conservar);
  if (!paths.length) return;
  const { error: errorBorrado } = await bucket.remove(paths);
  if (errorBorrado) throw errorBorrado;
}

export function urlFotoPerfil(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("fotos_perfil").getPublicUrl(path).data.publicUrl;
}

// Abre el adjunto validando el esquema. Defensa en profundidad (hallazgo #6):
// aunque hoy solo un admin escribe `adjunto_url` (policy ev_write), no confiamos
// en el valor guardado. Solo se permite https:// — así no se disparan esquemas
// peligrosos como javascript:, file:// o intent://.
export async function abrirAdjunto(url: string | null | undefined): Promise<void> {
  if (!url || !/^https:\/\//i.test(url)) {
    Alert.alert("No se puede abrir", "El enlace del adjunto no es válido.");
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("No se pudo abrir", "No fue posible abrir el adjunto.");
  }
}
