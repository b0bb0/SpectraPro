'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Shield,
  Key,
  Search,
  UserCircle,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'
import { usersAPI } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'ADMIN' | 'ANALYST' | 'VIEWER'
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface UserStats {
  total: number
  active: number
  inactive: number
  byRole: Record<string, number>
}

export default function UsersPage() {
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    // Check if current user is admin
    if (currentUser?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }
    loadUsers()
  }, [currentUser])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const [usersData, statsData] = await Promise.all([
        usersAPI.list(),
        usersAPI.getStats(),
      ])

      setUsers(usersData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load users:', error)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

    try {
      await usersAPI.delete(userId)
      setSuccess('User deleted successfully')
      loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (error: any) {
      setError(error.message || 'Failed to delete user')
      setTimeout(() => setError(''), 5000)
    }
  }

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'ANALYST':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'VIEWER':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Shield className="w-4 h-4" />
      case 'ANALYST':
        return <Users className="w-4 h-4" />
      case 'VIEWER':
        return <UserCircle className="w-4 h-4" />
      default:
        return <Users className="w-4 h-4" />
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (date: Date | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">User Management</h1>
          <p className="text-text-secondary mt-1">
            Manage team members and their access levels
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-premium px-4 py-2 text-sm flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="glass-panel p-4 border-red-500/30 bg-red-500/5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {success && (
        <div className="glass-panel p-4 border-green-500/30 bg-green-500/5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-400">{success}</p>
          </div>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">{stats.total}</p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Total Users</h3>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">{stats.active}</p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Active Users</h3>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">{stats.byRole.ADMIN || 0}</p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Administrators</h3>
          </div>

          <div className="card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-text-primary">{stats.byRole.ANALYST || 0}</p>
              </div>
            </div>
            <h3 className="text-text-secondary text-sm font-medium">Analysts</h3>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="glass-panel p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-dark-200 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="card-hover overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">
                  User
                </th>
                <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">
                  Role
                </th>
                <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">
                  Status
                </th>
                <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">
                  Last Login
                </th>
                <th className="text-left py-4 px-6 text-text-secondary font-medium text-sm">
                  Joined
                </th>
                <th className="text-right py-4 px-6 text-text-secondary font-medium text-sm">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-700/50 hover:bg-white/5 transition-colors"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {user.firstName[0]}{user.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-text-primary font-medium">
                          {user.firstName} {user.lastName}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-gray-400">(You)</span>
                          )}
                        </p>
                        <p className="text-text-muted text-sm">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {getRoleIcon(user.role)}
                      <span>{user.role}</span>
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {user.isActive ? (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                        <CheckCircle className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                        <span>Inactive</span>
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-text-secondary text-sm">
                      {formatDateTime(user.lastLoginAt)}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-text-secondary text-sm">
                      {formatDate(user.createdAt)}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user)
                          setShowEditModal(true)
                        }}
                        className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user)
                          setShowPasswordModal(true)
                        }}
                        className="p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors"
                        title="Change password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-text-secondary">No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            setSuccess('User created successfully')
            loadUsers()
            setTimeout(() => setSuccess(''), 3000)
          }}
          onError={(err) => {
            setError(err)
            setTimeout(() => setError(''), 5000)
          }}
        />
      )}

      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false)
            setSelectedUser(null)
          }}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedUser(null)
            setSuccess('User updated successfully')
            loadUsers()
            setTimeout(() => setSuccess(''), 3000)
          }}
          onError={(err) => {
            setError(err)
            setTimeout(() => setError(''), 5000)
          }}
        />
      )}

      {showPasswordModal && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={() => {
            setShowPasswordModal(false)
            setSelectedUser(null)
          }}
          onSuccess={() => {
            setShowPasswordModal(false)
            setSelectedUser(null)
            setSuccess('Password changed successfully')
            setTimeout(() => setSuccess(''), 3000)
          }}
          onError={(err) => {
            setError(err)
            setTimeout(() => setError(''), 5000)
          }}
        />
      )}
    </div>
  )
}

// Create User Modal Component
function CreateUserModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void
  onSuccess: () => void
  onError: (error: string) => void
}) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'VIEWER' as 'ADMIN' | 'ANALYST' | 'VIEWER',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      onError('All fields are required')
      return
    }

    if (formData.password.length < 8) {
      onError('Password must be at least 8 characters')
      return
    }

    try {
      setLoading(true)
      await usersAPI.create(formData)
      onSuccess()
    } catch (error: any) {
      onError(error.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass-panel p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Create New User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              placeholder="Min. 8 characters"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'ADMIN' | 'ANALYST' | 'VIEWER',
                })
              }
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="VIEWER">Viewer - Read-only access</option>
              <option value="ANALYST">Analyst - Can manage scans and vulnerabilities</option>
              <option value="ADMIN">Admin - Full system access</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-premium px-4 py-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Create User'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit User Modal Component
function EditUserModal({
  user,
  onClose,
  onSuccess,
  onError,
}: {
  user: User
  onClose: () => void
  onSuccess: () => void
  onError: (error: string) => void
}) {
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setLoading(true)
      await usersAPI.update(user.id, formData)
      onSuccess()
    } catch (error: any) {
      onError(error.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass-panel p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Edit User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full bg-dark-300 border border-gray-700 rounded-lg px-4 py-2 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'ADMIN' | 'ANALYST' | 'VIEWER',
                })
              }
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="VIEWER">Viewer - Read-only access</option>
              <option value="ANALYST">Analyst - Can manage scans and vulnerabilities</option>
              <option value="ADMIN">Admin - Full system access</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 bg-dark-200 rounded-lg">
            <span className="text-sm text-gray-300">Account Status</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-300">
                {formData.isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-premium px-4 py-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Save Changes'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Change Password Modal Component
function ChangePasswordModal({
  user,
  onClose,
  onSuccess,
  onError,
}: {
  user: User
  onClose: () => void
  onSuccess: () => void
  onError: (error: string) => void
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      onError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      onError('Passwords do not match')
      return
    }

    try {
      setLoading(true)
      await usersAPI.changePassword(user.id, password)
      onSuccess()
    } catch (error: any) {
      onError(error.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass-panel p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Change Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-blue-400">
            Changing password for: <strong>{user.firstName} {user.lastName}</strong> ({user.email})
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              placeholder="Min. 8 characters"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-dark-200 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              placeholder="Re-enter password"
              required
            />
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-premium px-4 py-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Change Password'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
