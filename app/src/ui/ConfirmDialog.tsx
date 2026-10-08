import { Modal, Text, View } from 'react-native';
import { Button } from './components';
import { colors, styles } from './theme';

export function ConfirmDialog({
  visible,
  text,
  cancelLabel,
  confirmLabel,
  busy,
  error,
  cancel,
  confirm,
}: {
  visible: boolean;
  text: string;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  cancel: () => void;
  confirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={() => {
        if (!busy) cancel();
      }}
    >
      <View style={{ flex: 1, padding: 28, backgroundColor: '#17271FCC', justifyContent: 'center' }}>
        <View style={[styles.card, { gap: 16 }]}>
          <Text style={styles.text}>{text}</Text>
          {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{error}</Text>}
          <Button label={cancelLabel} disabled={busy} onPress={cancel} />
          <Button label={confirmLabel} secondary busy={busy} onPress={confirm} />
        </View>
      </View>
    </Modal>
  );
}
