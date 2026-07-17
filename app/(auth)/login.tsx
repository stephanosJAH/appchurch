import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Display, Field, Headline, Label, Muted } from "../../components/ui";
import { identifierToEmail, isValidIdentifier, normalizeIdentifier } from "../../lib/authIdentity";
import { supabase } from "../../lib/supabase";
import { cardShadow, colors, fonts } from "../../lib/theme";

type Mode = "login" | "signup";

// Requisitos mínimos de contraseña (#8 Parte A). Devuelve el problema o null.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Usá al menos 8 caracteres.";
  if (/^\d+$/.test(pw)) return "No uses solo números; sumá letras.";
  return null;
}

// Traduce errores de Supabase (que hablan de "email") a algo entendible: acá el
// identificador es un usuario/teléfono, no un correo.
function traducirError(msg?: string): string {
  if (!msg) return "No se pudo completar la operación.";
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese dato ya tiene una cuenta. Si es el teléfono de tu familia y ya lo usó otra persona, escribí otro dato (por ejemplo tu nombre y apellido).";
  if (m.includes("invalid login credentials")) return "Usuario o contraseña incorrectos.";
  if (m.includes("weak") || m.includes("password")) return "La contraseña no cumple los requisitos mínimos.";
  return msg;
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("login");
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const submit = async () => {
    const id = identificador.trim();
    if (!id || !password) {
      Alert.alert("Faltan datos", "Ingresá usuario/teléfono y contraseña.");
      return;
    }
    if (mode === "signup") {
      if (!nombre.trim()) {
        Alert.alert("Faltan datos", "Ingresá tu nombre.");
        return;
      }
      if (!isValidIdentifier(id)) {
        Alert.alert("Usuario inválido", "Usá al menos 3 letras/números, o un teléfono válido.");
        return;
      }
      const problema = passwordProblem(password);
      if (problema) {
        Alert.alert("Contraseña débil", problema);
        return;
      }
    }
    setLoading(true);
    try {
      const emailSintetico = identifierToEmail(id);
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: emailSintetico, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailSintetico,
          password,
          options: { data: { nombre_completo: nombre.trim(), username: normalizeIdentifier(id) } },
        });
        if (error) throw error;
        // Sin verificación de email: si no vino sesión, iniciamos sesión directo.
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: emailSintetico,
            password,
          });
          if (signInError) throw signInError;
        }
      }
    } catch (e: any) {
      Alert.alert("Error", traducirError(e?.message));
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = () => {
    Alert.alert("Recupera tu contraseña", "Ponete en contacto con un administrador.");
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-cream" behavior="padding">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6">
          {/* Marca */}
          <View className="mb-8 items-center">
            <View style={cardShadow} className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-navy">
              <Ionicons name="book" size={28} color={colors.tertiaryDim} />
            </View>
            <Display className="text-center">Discipulados</Display>
            <Body className="mt-1 text-center">Gestión de grupos de la iglesia</Body>
          </View>

          {/* Tarjeta */}
          <Card className="p-6">
            <Headline>{isLogin ? "Bienvenido de nuevo" : "Creá tu cuenta"}</Headline>
            <Body className="mb-6 mt-1">
              {isLogin ? "Ingresá tus credenciales para continuar." : "Completá tus datos para empezar."}
            </Body>

            {!isLogin && (
              <Field
                label="Nombre completo"
                icon="person-outline"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Tu nombre"
                autoCapitalize="words"
              />
            )}

            <Field
              label="Teléfono"
              icon="call-outline"
              value={identificador}
              onChangeText={setIdentificador}
              placeholder="Tu número de teléfono"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Sin keyboardType="phone-pad": si no hay teléfono propio, o el
                familiar ya tiene cuenta, esta misma caja acepta otro dato
                (ver isValidIdentifier / traducirError). */}
            {!isLogin && (
              <Muted className="-mt-2 mb-4">
                ¿No tenés teléfono propio, o el de tu familia ya tiene cuenta? Escribí tu nombre y apellido, como
                figurás en tu discipulado.
              </Muted>
            )}

            {/* Contraseña con label + enlace de recuperación */}
            <View className="mb-1.5 flex-row items-center justify-between">
              <Label>Contraseña</Label>
              {isLogin ? (
                <Text
                  onPress={forgotPassword}
                  style={{ fontFamily: fonts.sansSemibold }}
                  className="text-sm text-gold active:opacity-70"
                >
                  ¿Olvidó su contraseña?
                </Text>
              ) : null}
            </View>
            <Field
              icon="lock-closed-outline"
              rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
              onRightIconPress={() => setShowPassword((v) => !v)}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            {isLogin ? (
              <Pressable
                onPress={() => setRemember((v) => !v)}
                hitSlop={6}
                className="mb-5 mt-1 flex-row items-center active:opacity-70"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    remember ? "border-navy bg-navy" : "border-black/25 bg-surface"
                  }`}
                >
                  {remember ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Muted className="ml-2.5 text-ink-variant">Mantener sesión iniciada</Muted>
              </Pressable>
            ) : (
              <Muted className="mb-4 mt-1">Mínimo 8 caracteres, no solo números.</Muted>
            )}

            <Button
              title={isLogin ? "Iniciar Sesión" : "Crear cuenta"}
              icon="arrow-forward"
              onPress={submit}
              loading={loading}
            />

            <View className="mt-6 flex-row justify-center">
              <Muted>{isLogin ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}</Muted>
              <Text
                style={{ fontFamily: fonts.sansSemibold }}
                className="text-sm text-gold active:opacity-70"
                onPress={() => setMode(isLogin ? "signup" : "login")}
              >
                {isLogin ? "Registrate" : "Ingresá"}
              </Text>
            </View>
          </Card>

          {/* Pie */}
          <Muted className="mt-8 text-center text-xs">
            © 2026 Discipulados. Todos los derechos reservados.
          </Muted>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
