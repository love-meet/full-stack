import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Group, GroupRole } from './useGroups'

export type GroupMember = {
  user_id: string
  role: GroupRole
  joined_at: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
}

type RawMember = {
  user_id: string
  role: GroupRole
  joined_at: string
  member: { handle: string | null; display_name: string | null; avatar_url: string | null } | null
}

type CreateGroupVars = {
  name: string
  description?: string | null
  welcome?: string | null
  instructions?: string | null
  avatarUrl?: string | null
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: CreateGroupVars) => {
      const { data, error } = await supabase
        .rpc('create_group', {
          p_name: vars.name,
          p_description: vars.description ?? null,
          p_welcome: vars.welcome ?? null,
          p_instructions: vars.instructions ?? null,
          p_avatar_url: vars.avatarUrl ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Group
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

export function useJoinGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc('join_group', { gid: groupId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group'] })
    },
  })
}

export function useLeaveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc('leave_group', { gid: groupId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group'] })
    },
  })
}

export function useGroupMembers(groupId: string | null | undefined) {
  return useQuery<GroupMember[]>({
    queryKey: ['group-members', groupId ?? null],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, joined_at, member:profiles!user_id(handle, display_name, avatar_url)')
        .eq('group_id', groupId!)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RawMember[]).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        handle: m.member?.handle ?? null,
        display_name: m.member?.display_name ?? null,
        avatar_url: m.member?.avatar_url ?? null,
      }))
    },
  })
}

export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_group_member', { gid: groupId, target: userId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['group'] })
    },
  })
}

export function useSetGroupMemberRole(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; role: 'admin' | 'member' }) => {
      const { error } = await supabase.rpc('set_group_member_role', {
        gid: groupId,
        target: vars.userId,
        next_role: vars.role,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-members', groupId] }),
  })
}
