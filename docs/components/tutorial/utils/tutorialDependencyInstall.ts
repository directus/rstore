import type { TutorialSnapshot } from './types'

export interface TutorialDependencyInstallCommand {
  args: string[]
  label: string
}

export interface TutorialDependencyInstallPlan {
  fallback: TutorialDependencyInstallCommand | null
  primary: TutorialDependencyInstallCommand
}

const npmInstallCommand: TutorialDependencyInstallCommand = {
  args: ['install', '--no-audit'],
  label: 'npm install --no-audit',
}

const npmCiCommand: TutorialDependencyInstallCommand = {
  args: ['ci', '--no-audit', '--prefer-offline'],
  label: 'npm ci --no-audit --prefer-offline',
}

export function createTutorialDependencyInstallPlan(snapshot: TutorialSnapshot): TutorialDependencyInstallPlan {
  const hasLockfile = Boolean(snapshot['package-lock.json']?.trim())

  if (!hasLockfile) {
    return {
      primary: npmInstallCommand,
      fallback: null,
    }
  }

  return {
    primary: npmCiCommand,
    fallback: npmInstallCommand,
  }
}
