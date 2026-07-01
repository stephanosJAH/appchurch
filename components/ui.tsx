import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  ScrollView,
  ScrollViewProps,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardShadow, colors, fonts } from "../lib/theme";

/* ============================ Tipografía ============================ */

export function Display({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Text
      style={{ fontFamily: fonts.serifBold, lineHeight: 40 }}
      className={`text-[32px] text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

export function Headline({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Text
      style={{ fontFamily: fonts.serifSemibold, lineHeight: 32 }}
      className={`text-2xl text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

// Título serif dentro de tarjetas.
export function Title({ children, className, numberOfLines }: PropsWithChildren<{ className?: string; numberOfLines?: number }>) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={{ fontFamily: fonts.serifSemibold, lineHeight: 26 }}
      className={`text-[19px] text-ink ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

export function Body({ children, className, ...rest }: PropsWithChildren<{ className?: string } & TextProps>) {
  return (
    <Text style={{ fontFamily: fonts.sans, lineHeight: 24 }} className={`text-base text-ink-variant ${className ?? ""}`} {...rest}>
      {children}
    </Text>
  );
}

export function Muted({ children, className, ...rest }: PropsWithChildren<{ className?: string } & TextProps>) {
  return (
    <Text style={{ fontFamily: fonts.sans, lineHeight: 20 }} className={`text-sm text-ink-muted ${className ?? ""}`} {...rest}>
      {children}
    </Text>
  );
}

// Etiqueta en mayúsculas (labels de sección / campos).
export function Label({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Text
      style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
      className={`text-xs uppercase text-ink-muted ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}

/* ============================ Contenedores ============================ */

export function Screen({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <View className={`flex-1 bg-cream ${className ?? ""}`}>{children}</View>;
}

// ScrollView para formularios: mantiene el input enfocado visible cuando abre
// el teclado (iOS via automaticallyAdjustKeyboardInsets; Android via adjustResize)
// y permite tocar botones sin cerrar el teclado antes.
export function KeyboardScrollView({
  children,
  className,
  contentContainerStyle,
  ...props
}: PropsWithChildren<ScrollViewProps> & { className?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className={`flex-1 bg-cream ${className ?? ""}`}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[
        { padding: 16, paddingBottom: insets.bottom + 32 },
        contentContainerStyle,
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, className, style, ...props }: PropsWithChildren<ViewProps> & { className?: string }) {
  return (
    <View
      style={[cardShadow, style]}
      className={`rounded-2xl border border-black/5 bg-surface p-5 ${className ?? ""}`}
      {...props}
    >
      {children}
    </View>
  );
}

/* ============================ Chips / Tags ============================ */

type ChipTone = "navy" | "gold" | "neutral" | "success" | "danger";

export function Chip({ children, tone = "navy" }: PropsWithChildren<{ tone?: ChipTone }>) {
  const bg: Record<ChipTone, string> = {
    navy: "bg-navy",
    gold: "bg-gold-container",
    neutral: "bg-surface-high",
    success: "bg-emerald-100",
    danger: "bg-red-100",
  };
  const fg: Record<ChipTone, string> = {
    navy: "text-white",
    gold: "text-gold-on",
    neutral: "text-ink-variant",
    success: "text-emerald-800",
    danger: "text-red-700",
  };
  return (
    <View className={`self-start rounded-md px-2.5 py-1 ${bg[tone]}`}>
      <Text style={{ fontFamily: fonts.sansBold, letterSpacing: 0.8 }} className={`text-[10px] uppercase ${fg[tone]}`}>
        {children}
      </Text>
    </View>
  );
}

/* ============================ Botones ============================ */

type ButtonProps = PressableProps & {
  title: string;
  variant?: "primary" | "outline" | "gold" | "danger" | "ghost";
  loading?: boolean;
  size?: "md" | "sm";
};

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  size = "md",
  ...props
}: ButtonProps) {
  const bg: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-navy",
    outline: "bg-transparent border border-navy",
    gold: "bg-gold",
    danger: "bg-transparent border border-danger",
    ghost: "bg-transparent",
  };
  const fg: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "text-white",
    outline: "text-navy",
    gold: "text-white",
    danger: "text-danger",
    ghost: "text-ink-variant",
  };
  const pad = size === "sm" ? "px-3.5 py-2" : "px-5 py-3.5";
  return (
    <Pressable
      disabled={disabled || loading}
      style={variant === "primary" || variant === "gold" ? cardShadow : undefined}
      className={`flex-row items-center justify-center rounded-lg ${pad} ${bg[variant]} ${
        disabled || loading ? "opacity-50" : "active:opacity-80"
      }`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "gold" ? "#fff" : colors.primary} />
      ) : (
        <Text style={{ fontFamily: fonts.sansSemibold }} className={`text-[15px] ${fg[variant]} ${size === "sm" ? "text-sm" : ""}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// Enlace de acción en dorado (ej. "Ver Detalles", "Gestionar").
export function LinkAction({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Text onPress={onPress} style={{ fontFamily: fonts.sansSemibold }} className="text-[15px] text-gold active:opacity-70">
      {title}
    </Text>
  );
}

/* ============================ Campos ============================ */

type FieldProps = TextInputProps & {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Field({ label, error, icon, className, style, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderClass = error ? "border-danger" : focused ? "border-gold" : "border-black/10";
  return (
    <View className="mb-4">
      {label ? <Label className="mb-1.5">{label}</Label> : null}
      <View className={`flex-row items-center rounded-lg border bg-surface ${borderClass}`}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.outline} style={{ marginLeft: 14 }} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.outline}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[{ fontFamily: fonts.sans }, style]}
          className={`flex-1 px-4 py-3.5 text-base text-ink ${icon ? "pl-2.5" : ""} ${className ?? ""}`}
          {...props}
        />
      </View>
      {error ? <Muted className="mt-1 text-danger">{error}</Muted> : null}
    </View>
  );
}

/* ============================ Avatar ============================ */

export function Avatar({ name, size = 40, tone = "navy" }: { name?: string | null; size?: number; tone?: "navy" | "gold" }) {
  const bg = tone === "gold" ? "bg-gold-container" : "bg-navy-container";
  const fg = tone === "gold" ? "text-gold-on" : "text-white";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className={`items-center justify-center ${bg}`}>
      <Text style={{ fontFamily: fonts.serifSemibold, fontSize: size * 0.42 }} className={fg}>
        {(name ?? "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
