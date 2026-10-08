import { StyleSheet } from 'react-native';

export const colors = {
  paper: '#F5FAF8',
  white: '#FFFFFF',
  ink: '#20545B',
  muted: '#718889',
  green: '#208B91',
  pale: '#E3F4F1',
  line: '#DEECE7',
  orange: '#DE9955',
  sand: '#FFF0DB',
  red: '#B65E4B',
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tapTarget: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  heading: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 2.5, fontWeight: '600', color: colors.muted },
  text: { color: colors.ink, fontSize: 14, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    color: colors.ink,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    fontSize: 14,
  },
  shadow: {
    shadowColor: '#263E33',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 15,
    elevation: 4,
  },
});
