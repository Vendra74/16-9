import type { ComponentRef, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

type FieldProps = TextInputProps & { label: string; hint?: string; ref?: Ref<ComponentRef<typeof TextInput>> };

/** Campo de texto no estilo escuro do app, com rótulo em caixa alta. */
export function Field({ label, hint, style, ref, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={Colors.textMuted}
        selectionColor={Colors.silver}
        keyboardAppearance="dark"
        style={[styles.input, props.multiline && styles.multiline, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
};

/** Botão principal (prata sobre preto) ou discreto (só texto). */
export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.ghost,
        (pressed || disabled) && styles.dimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? Colors.background : Colors.text} />
      ) : (
        <Text style={[styles.buttonText, primary ? styles.primaryText : styles.ghostText]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Mensagem de erro ou aviso abaixo de um formulário. */
export function FormMessage({ text, tone = 'error' }: { text: string | null; tone?: 'error' | 'info' }) {
  if (!text) return null;
  return <Text style={[styles.message, tone === 'info' && styles.info]}>{text}</Text>;
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    color: Colors.text,
    fontSize: 16,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  button: {
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primary: {
    backgroundColor: Colors.silver,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  dimmed: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryText: {
    color: Colors.background,
  },
  ghostText: {
    color: Colors.textSecondary,
  },
  message: {
    color: '#FF8A80',
    fontSize: 13,
  },
  info: {
    color: Colors.textSecondary,
  },
});
