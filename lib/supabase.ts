import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as aesjs from "aes-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla temprano y claro si faltan las credenciales (.env)
  console.warn(
    "[supabase] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copiá .env.example a .env y completá tus credenciales."
  );
}

// =====================================================================
// LargeSecureStore — storage adapter cifrado para la sesión de Supabase
// (hallazgo de seguridad #4).
//
// SecureStore (Keychain en iOS / Keystore en Android) no admite valores de
// más de 2048 bytes, y la sesión de Supabase (access token + refresh token de
// larga vida + user) los supera. Patrón oficial de Supabase: se genera una
// clave AES-256 al azar, se guarda SOLO la clave en SecureStore (respaldado por
// hardware) y el valor cifrado se guarda en AsyncStorage. Así, un atacante con
// acceso al storage plano (root, backup, malware) obtiene únicamente texto
// cifrado; sin la clave del keystore no puede recuperar el refresh token.
//
// La aleatoriedad viene de expo-crypto (getRandomBytes) en vez de
// react-native-get-random-values, para no agregar un módulo nativo fuera de
// Expo Go. expo-secure-store, expo-crypto y aes-js corren en Expo Go 54.
// =====================================================================
class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<string> {
    // Clave AES-256 nueva por cada escritura; se guarda en el keystore.
    const encryptionKey = Crypto.getRandomBytes(256 / 8);

    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1)
    );
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    // Sin clave en el keystore no hay forma de descifrar: se trata como ausente
    // (p. ej. sesión vieja en texto plano de una versión previa -> re-login).
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this._decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
