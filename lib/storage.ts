import * as DocumentPicker from "expo-document-picker";
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
export async function subirAdjunto(
  file: AdjuntoLocal
): Promise<{ url: string; tipo: AdjuntoTipo }> {
  const arraybuffer = await fetch(file.uri).then((r) => r.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.split(".").pop() : file.tipo === "pdf" ? "pdf" : "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("adjuntos")
    .upload(path, arraybuffer, { contentType: file.mimeType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("adjuntos").getPublicUrl(path);
  return { url: data.publicUrl, tipo: file.tipo };
}
