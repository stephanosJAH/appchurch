import { Alert, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
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
  const arraybuffer = await fetch(file.uri).then((r) => r.arrayBuffer());
  const fallbackExt = file.tipo === "pdf" ? "pdf" : "jpg";
  const rawExt = file.name.includes(".") ? file.name.split(".").pop()! : fallbackExt;
  // Sanitiza la extensión (viene del nombre elegido por el usuario): evita
  // caracteres raros o "/" en el path del objeto.
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || fallbackExt;
  const path = `${Crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("adjuntos")
    .upload(path, arraybuffer, { contentType: file.mimeType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("adjuntos").getPublicUrl(path);
  return { url: data.publicUrl, tipo: file.tipo };
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
