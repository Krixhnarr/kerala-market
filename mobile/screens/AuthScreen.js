import React, { useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { Button } from '../components/ui';

// Email + password sign in / sign up, and a magic-link option. Shown as a
// modal from wherever a signed-in action is attempted.
export default function AuthScreen({ visible, onClose, message }) {
  const t = useTheme();
  const [signUp, setSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      if (signUp) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) return setMsg(error.message);
        if (data.session) onClose();
        else setMsg('Account created — check your email to confirm, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return setMsg(error.message);
        onClose();
      }
    } finally { setBusy(false); }
  };
  const magic = async () => {
    if (!email.trim()) return setMsg('Enter your email first.');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setMsg(error ? error.message : 'Check your inbox for a sign-in link.');
  };
  const good = msg.startsWith('Check') || msg.startsWith('Account');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Text style={[s.title, { color: t.ink }]}>{signUp ? 'Create an account' : 'Sign in'}</Text>
          {message ? <Text style={{ color: t.secondary, marginBottom: 10 }}>{message}</Text> : null}
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.muted}
            autoCapitalize="none" keyboardType="email-address" autoComplete="email"
            style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg }]} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={t.muted}
            secureTextEntry autoComplete={signUp ? 'new-password' : 'current-password'}
            style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={signUp ? 'Create account' : 'Sign in'} primary onPress={submit} disabled={busy} style={{ flex: 1 }} />
            <Button title="Email me a link" onPress={magic} style={{ flex: 1 }} />
          </View>
          {msg ? <Text style={{ color: good ? t.up : t.down, fontSize: 13, marginTop: 10 }}>{msg}</Text> : null}
          <Pressable onPress={() => { setSignUp(!signUp); setMsg(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: t.secondary, fontSize: 13 }}>
              {signUp ? 'Already have an account? ' : 'New here? '}
              <Text style={{ color: t.accent }}>{signUp ? 'Sign in' : 'Create an account'}</Text>
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 14, borderWidth: 1, padding: 22 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
});
