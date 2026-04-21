import Markdown from 'react-native-markdown-display';
import MarkdownIt from 'markdown-it';
import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type Props = {
  markdown: string;
};

export function ReaderMarkdown({ markdown }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const textColor = Colors[scheme].text;
  const tint = Colors[scheme].tint;
  const codeBg = scheme === 'dark' ? '#1c1c1e' : '#f2f2f7';

  const markdownIt = useMemo(
    () =>
      MarkdownIt({
        typographer: false,
        html: false,
        linkify: true,
      }),
    [],
  );

  const styles = useMemo(
    () => ({
      body: {
        color: textColor,
        fontSize: 17,
        lineHeight: 26,
      },
      heading1: { color: textColor, fontSize: 22, fontWeight: '700' as const, marginBottom: 8 },
      heading2: { color: textColor, fontSize: 20, fontWeight: '700' as const, marginBottom: 6 },
      heading3: { color: textColor, fontSize: 18, fontWeight: '600' as const, marginBottom: 4 },
      paragraph: { marginTop: 0, marginBottom: 12, color: textColor, fontSize: 17, lineHeight: 26 },
      strong: { fontWeight: '700' as const },
      em: { fontStyle: 'italic' as const },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { marginBottom: 4, flexDirection: 'row' as const },
      bullet_list_icon: { marginLeft: 0, marginRight: 8, fontSize: 17, lineHeight: 26 },
      code_inline: {
        fontFamily: 'SpaceMono',
        backgroundColor: codeBg,
        paddingHorizontal: 4,
        borderRadius: 4,
        fontSize: 15,
      },
      fence: {
        fontFamily: 'SpaceMono',
        backgroundColor: codeBg,
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        fontSize: 14,
        color: textColor,
      },
      link: { color: tint, textDecorationLine: 'underline' as const },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: tint,
        paddingLeft: 12,
        marginBottom: 12,
        opacity: 0.95,
      },
    }),
    [codeBg, textColor, tint],
  );

  return (
    <Markdown
      markdownit={markdownIt}
      style={styles}
      mergeStyle
      onLinkPress={() => {
        Alert.alert('Links are not supported in MVP');
        return false;
      }}>
      {markdown}
    </Markdown>
  );
}
