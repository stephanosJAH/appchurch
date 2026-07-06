import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Display, Field, Headline, Label, Muted } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { cardShadow, colors, fonts } from "../../lib/theme";

type Mode = "login" | "signup";

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const submit = async () => {
    if (!email || !password) {
      Alert.alert("Faltan datos", "Ingresá email y contraseña.");
      return;
    }
    if (mode === "signup" && !nombre.trim()) {
      Alert.alert("Faltan datos", "Ingresá tu nombre.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { nombre_completo: nombre.trim() } },
        });
        if (error) throw error;
        // Sin verificación de email: si no vino sesión, iniciamos sesión directo.
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw signInError;
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo completar la operación.");
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
              label="Correo electrónico"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="nombre@ejemplo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

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
              <View className="mb-1" />
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
