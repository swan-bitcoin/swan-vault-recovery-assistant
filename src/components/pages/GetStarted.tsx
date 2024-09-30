import { GetStartedMachineContext } from '@/context'
import { DescriptorForm, ElectrumServerForm, GetStartedSuccess } from '../organisms'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '../ui/breadcrumb'
import { Placeholder } from '../organisms/Placeholder'
import React from 'react'

export const GetStarted = () => {
  const currentState = GetStartedMachineContext.useSelector((snapshot) => snapshot.value)

  const steps: {
    label: string
    machineState: typeof currentState
    component: JSX.Element
  }[] = [
    { label: 'Descriptor', machineState: 'descriptorInput', component: <DescriptorForm /> },
    { label: 'Electrum Server', machineState: 'electrumServerConfig', component: <ElectrumServerForm /> },
    { label: 'Something else', machineState: 'somethingElse', component: <Placeholder /> },
    { label: 'Success', machineState: 'success', component: <GetStartedSuccess /> },
  ]

  const activeStep = steps.findIndex((step) => currentState.match(step.machineState))
  // We don't want a breadcrumb for the success step
  const breadcrumbSteps = steps.filter((step) => step.machineState !== 'success')

  return (
    <div className="flex flex-col flex-grow p-4 gap-8 items-center">
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbSteps.map((step, index) => (
            <React.Fragment key={step.label}>
              <BreadcrumbItem key={index}>
                {index === activeStep ? <BreadcrumbPage>{step.label}</BreadcrumbPage> : <>{step.label}</>}
              </BreadcrumbItem>
              {index < breadcrumbSteps.length - 1 ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {steps[activeStep].component}
    </div>
  )
}
