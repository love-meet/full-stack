import { createBrowserRouter } from 'react-router-dom'
import Shell from './shell/Shell'
import RequireSession from './shell/RequireSession'
import RequireProfile from './shell/RequireProfile'
import LandingScreen from './screens/LandingScreen'
import BlogScreen from './screens/blog/BlogScreen'
import ArticleScreen from './screens/blog/ArticleScreen'
import OnboardingScreen from './screens/onboarding/OnboardingScreen'
import FeedScreen from './screens/FeedScreen'
import ExploreScreen from './screens/ExploreScreen'
import GroupScreen from './screens/GroupScreen'
import GroupPostDetailScreen from './screens/GroupPostDetailScreen'
import GroupManageScreen from './screens/GroupManageScreen'
import CreateGroupScreen from './screens/settings/CreateGroupScreen'
import PostScreen from './screens/post/PostScreen'
import ChatScreen from './screens/ChatScreen'
import ChatDetailScreen from './screens/ChatDetailScreen'
import SearchScreen from './screens/SearchScreen'
import GamesScreen from './screens/GamesScreen'
import InterviewScreen from './screens/InterviewScreen'
import PlanCheckoutScreen from './screens/settings/PlanCheckoutScreen'
import PixelRushScreen from './screens/games/PixelRushScreen'
import NumberDuelScreen from './screens/games/NumberDuelScreen'
import PlayGameScreen from './screens/games/PlayGameScreen'
import GiftDetailScreen from './screens/GiftDetailScreen'
import GuideScreen from './screens/GuideScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import ProfileScreen from './screens/ProfileScreen'
import PostDetailScreen from './screens/PostDetailScreen'
import EditProfileScreen from './screens/settings/EditProfileScreen'
import LegalScreen from './screens/legal/LegalScreen'
import WalletScreen, { EarningsScreen } from './screens/settings/WalletScreen'
import SecurityScreen from './screens/settings/SecurityScreen'
import CloseAccountScreen from './screens/settings/CloseAccountScreen'
import DepositScreen from './screens/settings/DepositScreen'
import WithdrawScreen from './screens/settings/WithdrawScreen'
import PayoutDetailsScreen from './screens/settings/PayoutDetailsScreen'
import SubscriptionScreen from './screens/settings/SubscriptionScreen'
import ProfileMenuScreen from './screens/settings/ProfileMenuScreen'
import SavedPostsScreen from './screens/settings/SavedPostsScreen'
import InviteFriendsScreen from './screens/settings/InviteFriendsScreen'
import AffiliateScreen from './screens/settings/AffiliateScreen'
import { BlockedUsersScreen, MutedUsersScreen } from './screens/settings/RelationListScreen'
import AdminLayout from './screens/admin/AdminLayout'
import AdminDashboard from './screens/admin/AdminDashboard'
import ModerationQueue from './screens/admin/ModerationQueue'
import UserManagement from './screens/admin/UserManagement'
import PayoutApproval from './screens/admin/PayoutApproval'
import TransactionsView from './screens/admin/TransactionsView'
import SupportInbox from './screens/admin/SupportInbox'
import SupportScreen from './screens/support/SupportScreen'
import SupportTicketScreen from './screens/support/SupportTicketScreen'

export const router = createBrowserRouter([
  // Public landing — no auth required.
  { path: '/', element: <LandingScreen /> },

  // Public, crawlable SEO blog — no auth required.
  { path: '/blog', element: <BlogScreen /> },
  { path: '/blog/:slug', element: <ArticleScreen /> },

  // Public game lobby — guests (no account) can join via the invite link.
  { path: '/play/:code', element: <PlayGameScreen /> },

  // Signed-in but not-yet-onboarded users can reach /onboarding.
  {
    element: <RequireSession />,
    children: [
      { path: 'onboarding', element: <OnboardingScreen /> },

      // Fully onboarded users get the app routes.
      {
        element: <RequireProfile />,
        children: [
          // Full-screen chat detail (no shell so the input bar doesn't
          // fight the bottom nav). Has its own header with a back button.
          { path: 'chat/:conversationId', element: <ChatDetailScreen /> },

          // Support ticket thread (full-screen, pinned composer like chat).
          { path: 'support/:ticketId',    element: <SupportTicketScreen /> },

          // Group thread (full-screen, pinned composer like chat).
          { path: 'g/:slug/p/:postId',    element: <GroupPostDetailScreen /> },

          // Match-preferences interview — full-screen, no bottom nav.
          { path: 'interview',            element: <InterviewScreen /> },

          // Pay-and-unlock plan checkout — direct ALATPay, no wallet detour.
          { path: 'plans/:planId',        element: <PlanCheckoutScreen /> },

          // Shell-wrapped main app.
          {
            element: <Shell />,
            children: [
              { path: 'feed',                  element: <FeedScreen /> },
              { path: 'p/:postId',             element: <PostDetailScreen /> },
              { path: 'explore',               element: <ExploreScreen /> },
              { path: 'g/:slug',               element: <GroupScreen /> },
              { path: 'g/:slug/manage',        element: <GroupManageScreen /> },
              { path: 'groups/new',            element: <CreateGroupScreen /> },
              { path: 'post',                  element: <PostScreen /> },
              { path: 'games',                 element: <GamesScreen /> },
              { path: 'games/pixel-rush',      element: <PixelRushScreen /> },
              { path: 'games/number-duel',     element: <NumberDuelScreen /> },
              { path: 'gift/:giftId',          element: <GiftDetailScreen /> },
              { path: 'guide',                 element: <GuideScreen /> },
              { path: 'chat',                  element: <ChatScreen /> },
              { path: 'search',                element: <SearchScreen /> }, // header-link, not a bottom-nav tab
              { path: 'notifications',         element: <NotificationsScreen /> },
              { path: 'profile',               element: <ProfileScreen /> },
              { path: 'profile/edit',          element: <EditProfileScreen /> },
              { path: 'profile-menu',          element: <ProfileMenuScreen /> },
              { path: 'profile/:userId',       element: <ProfileScreen /> },
              { path: 'wallet',                element: <WalletScreen /> },
              { path: 'wallet/deposit',        element: <DepositScreen /> },
              { path: 'wallet/withdraw',       element: <WithdrawScreen /> },
              { path: 'wallet/payout-details', element: <PayoutDetailsScreen /> },
              { path: 'earnings',              element: <EarningsScreen /> },
              { path: 'subscription',          element: <SubscriptionScreen /> },
              { path: 'security',              element: <SecurityScreen /> },
              { path: 'saved',                 element: <SavedPostsScreen /> },
              { path: 'support',               element: <SupportScreen /> },
              { path: 'invite',                element: <InviteFriendsScreen /> },
              { path: 'affiliate',             element: <AffiliateScreen /> },
              { path: 'blocked',               element: <BlockedUsersScreen /> },
              { path: 'muted',                 element: <MutedUsersScreen /> },
              { path: 'close-account',         element: <CloseAccountScreen /> },
              { path: 'legal/:kind',           element: <LegalScreen /> },
              {
                path: 'admin',
                element: <AdminLayout />,
                children: [
                  { index: true,           element: <AdminDashboard /> },
                  { path: 'moderation',    element: <ModerationQueue /> },
                  { path: 'support',       element: <SupportInbox /> },
                  { path: 'users',         element: <UserManagement /> },
                  { path: 'payouts',       element: <PayoutApproval /> },
                  { path: 'transactions', element: <TransactionsView /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
])
