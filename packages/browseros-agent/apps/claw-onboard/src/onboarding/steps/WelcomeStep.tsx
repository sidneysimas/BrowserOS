import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface WelcomeStepProps {
  onPrimary: () => void
  onSkip: () => void
}

/** Renders the opening onboarding step and setup/reconnect choices. */
export function WelcomeStep({ onPrimary, onSkip }: WelcomeStepProps) {
  return (
    <StepWrap>
      <DisplayHeading>
        The browser your agents <Em>drive</Em>.
      </DisplayHeading>
      <StepCopy>
        Logged in as you, fast, and under your control. Set-up takes about two
        minutes. Import your logins and run your first task.
      </StepCopy>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onPrimary}>
          <Zap className="size-4" />
          Set up . about 2 min
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          I&rsquo;ve done this before . reconnect
        </Button>
      </div>
    </StepWrap>
  )
}
