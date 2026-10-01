import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import CreateProject from './CreateProject'

export default function EditProject() {
  const { projectId } = useParams()
  const { projects, me } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const editable = project && project.lead === me && (project.status === 'signing' || project.status === 'ready')

  if (!project || !editable)
    return (
      <div className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">This draft can’t be edited.</h1>
        <p className="mt-2 text-muted">Only the Lead can edit, and only before the vault is funded.</p>
        {project && (
          <Link to={`/p/${project.id}`} className="mt-6 inline-block underline">
            Back to the project
          </Link>
        )}
      </div>
    )

  return <CreateProject key={project.id} editing={project} />
}
