import nodePath from 'node:path'
import {
  type Config,
  types as allTypes,
} from '@pnpm/config'
import { PnpmError } from '@pnpm/error'
import { tryReadProjectManifest } from '@pnpm/read-project-manifest'
import { runNpm } from '@pnpm/run-npm'
import { sortPackages } from '@pnpm/sort-packages'
import {
  type Project,
  type ProjectRootDir,
  type ProjectRootDirRealPath,
} from '@pnpm/types'
import { pick } from 'ramda'
import renderHelp from 'render-help'

export interface VersionCommandResponse {
  exitCode: number
}

export function rcOptionsTypes (): Record<string, unknown> {
  return {
    ...pick([
      'npm-path',
    ], allTypes),
  }
}

export function cliOptionsTypes (): Record<string, unknown> {
  return {
    ...rcOptionsTypes(),
    ...pick([
      'sort',
    ], allTypes),
    recursive: Boolean,
    reverse: Boolean,
  }
}

export const commandNames = ['version']

export function help (): string {
  return renderHelp({
    description: 'Bump a package version',
    usages: ['pnpm version <new-version>'],
  })
}

export type VersionOpts = Pick<Config,
    | 'npmPath'
    | 'dir'
    | 'extraEnv'
    | 'configDir'
> & Required<Pick<Config, 'selectedProjectsGraph'>> & {
  recursive?: boolean
  reverse?: boolean
  sort?: boolean
}

export async function handler (
  opts: VersionOpts,
  params: string[]
): Promise<VersionCommandResponse> {
  let chunks!: ProjectRootDir[][]
  if (opts.recursive) {
    chunks = opts.sort
      ? sortPackages(opts.selectedProjectsGraph)
      : [(Object.keys(opts.selectedProjectsGraph) as ProjectRootDir[]).sort()]
    if (opts.reverse) {
      chunks = chunks.reverse()
    }
  } else {
    chunks = [[(opts.dir ?? process.cwd()) as ProjectRootDir]]
    const projectInfo = await tryReadProjectManifest(opts.dir)
    if (projectInfo.manifest != null) {
      opts.selectedProjectsGraph = {
        [opts.dir]: {
          dependencies: [],
          package: {
            manifest: projectInfo.manifest,
            rootDir: opts.dir as ProjectRootDir,
            rootDirRealPath: opts.dir as ProjectRootDirRealPath,
          } as Project,
        },
      }
    }
  }

  if (!opts.selectedProjectsGraph) {
    throw new PnpmError('RECURSIVE_VERSION_NO_PACKAGE', 'No package found in this workspace')
  }

  const userConfigPath = opts.configDir ? nodePath.join(opts.configDir, 'rc') : undefined
  let exitCode = 0

  for (const chunk of chunks) {
    for (const prefix of chunk) {
      try {
        const { status } = runNpm(opts.npmPath, ['version', ...params], {
          cwd: prefix,
          env: opts.extraEnv,
          userConfigPath,
        })
        if (status !== 0 && status !== null) {
          exitCode = status
        }
      } catch (err: any) { // eslint-disable-line
        if (!opts.recursive && typeof err.exitCode === 'number') {
          exitCode = err.exitCode
          continue
        }
        throw err
      }
    }
  }

  if (exitCode !== 0) {
    return { exitCode }
  }
  return { exitCode: 0 }
}
