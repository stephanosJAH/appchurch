import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Display, Field, Muted } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { colors, fonts } from "../../lib/theme";

type Mode = "login" | "signup";

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 16,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-7">
          <View className="mb-9 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-navy">
              <Ionicons name="book" size={30} color={colors.tertiaryDim} />
            </View>
            <Display className="text-center">Discipulados</Display>
            <Body className="mt-1 text-center">Gestión de grupos de la iglesia</Body>
          </View>

          {mode === "signup" && (
            <Field label="Nombre completo" value={nombre} onChangeText={setNombre} placeholder="Tu nombre" autoCapitalize="words" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="email@ejemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field label="Contraseña" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          <View className="mt-2">
            <Button title={mode === "login" ? "Ingresar" : "Crear cuenta"} onPress={submit} loading={loading} />
          </View>

          <View className="mt-6 flex-row justify-center">
            <Muted>{mode === "login" ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}</Muted>
            <Text
              style={{ fontFamily: fonts.sansSemibold }}
              className="text-sm text-gold"
              onPress={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Registrate" : "Ingresá"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
