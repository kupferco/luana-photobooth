import { Tabs } from 'expo-router'
import { Platform, Text, View, type ColorValue } from 'react-native'
import { useT } from '../../src/locale'
import { useTheme } from '../../src/theme'

/**
 * Three destinations: Home for everything that has happened, Event for the
 * one happening now, Profile for the person.
 *
 * Event sits in the middle and is drawn larger because it is the only tab
 * someone touches during a party, often at arm's length while holding
 * something else. The other two are for before and after.
 *
 * Booth mode deliberately lives outside this layout: it needs the whole
 * screen with no chrome, and a tab bar underneath it would be something to
 * catch with a thumb mid-countdown.
 */
export default function TabsLayout() {
  const theme = useTheme()
  const t = useT()

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.surface.raised },
        headerTintColor: theme.color.text.primary,
        sceneStyle: { backgroundColor: theme.color.surface.base },
        tabBarStyle: {
          backgroundColor: theme.color.surface.raised,
          borderTopColor: theme.color.border.subtle,
          height: Platform.OS === 'web' ? 68 : 88,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.color.text.primary,
        tabBarInactiveTintColor: theme.color.text.secondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color }) => <Dot color={color} />,
        }}
      />
      <Tabs.Screen
        name="event"
        options={{
          title: t('nav.event'),
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <EventButton focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color }) => <Dot color={color} />,
        }}
      />
    </Tabs>
  )
}

function Dot({ color }: { color: ColorValue }) {
  return (
    <View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
    />
  )
}

/** The raised centre button. Bigger because it is the one used mid-party. */
function EventButton({ focused }: { focused: boolean }) {
  const theme = useTheme()
  const t = useT()

  return (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        marginTop: -22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused
          ? theme.color.action.bg
          : theme.color.actionSecondary.bg,
        borderWidth: 3,
        borderColor: theme.color.surface.raised,
      }}
    >
      <Text
        style={{
          color: focused ? theme.color.action.fg : theme.color.text.primary,
          fontSize: theme.fontSize.xs,
          fontWeight: '700',
        }}
      >
        {t('nav.event')}
      </Text>
    </View>
  )
}
