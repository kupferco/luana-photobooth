import { Tabs } from 'expo-router'
import { Platform, Text, View } from 'react-native'
import { CameraIcon, HomeIcon, PersonIcon } from '../../src/ui/icons'
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
 * The icons are drawn with react-native-svg, which is already here for the
 * QR code. Plain dots were used first and read as decoration rather than
 * navigation -- nobody could tell what either one led to.
 *
 * Booth mode deliberately lives outside this layout: it needs the whole
 * screen with no chrome, and a tab bar underneath it would be something to
 * catch with a thumb mid-countdown.
 */
/**
 * How wide the app is allowed to get.
 *
 * Everything in here is laid out for a phone held in one hand, and stretched
 * across a desktop window it reads as a very wide form with the controls at
 * opposite ends. A column keeps the measure honest, and it is the shape the
 * thing is actually used in -- a phone on a tripod, or one in a pocket.
 *
 * Booth mode is deliberately outside this layout and stays full-bleed: it is
 * a camera, and it should take the whole screen.
 */
const MAX_WIDTH = 560

export default function TabsLayout() {
  const theme = useTheme()
  const t = useT()

  return (
    <DesktopColumn>
      <TabsNavigator theme={theme} t={t} />
    </DesktopColumn>
  )
}

/**
 * A centred column on a wide window, and nothing at all on a phone.
 *
 * Native returns the children untouched rather than wrapping them in a View
 * that would do nothing: an extra layer in the tree is an extra thing for
 * safe-area insets and the tab bar to be measured through.
 */
function DesktopColumn({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  if (Platform.OS !== 'web') return <>{children}</>

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.surface.sunken }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          backgroundColor: theme.color.surface.base,
          // Hairlines rather than a shadow: they hold the edge in both
          // themes, where a shadow disappears against a dark page.
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: theme.color.border.subtle,
        }}
      >
        {children}
      </View>
    </View>
  )
}

function TabsNavigator({
  theme,
  t,
}: {
  theme: ReturnType<typeof useTheme>
  t: ReturnType<typeof useT>
}) {
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
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
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
          tabBarIcon: ({ color }) => <PersonIcon color={color} />,
        }}
      />
    </Tabs>
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
      <CameraIcon
        color={focused ? theme.color.action.fg : theme.color.text.primary}
        size={26}
      />
      <Text
        style={{
          color: focused ? theme.color.action.fg : theme.color.text.primary,
          fontSize: 10,
          fontWeight: '700',
          marginTop: 1,
        }}
      >
        {t('nav.event')}
      </Text>
    </View>
  )
}
