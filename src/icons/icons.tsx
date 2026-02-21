// ============================================================================
// Icon factory y custom icons
// 1. Tener en el portapapeles en svg en texto
// 2. ejecutar el comando npm run svg-icon -- --name a --key b 
// 3. copiar el output y pegarlo acá y registrarlo en CustomIcons
// ========================================================================== 

import * as React from "react";

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, "children"> & {
    size?: number | string;
    title?: string;
};

type CreateIconOptions = {
    viewBox?: string;
    defaultSize?: number;
};

function createIcon(
    render: (props: Required<Pick<IconProps, "color" | "strokeWidth">>) => React.ReactNode,
    options: CreateIconOptions = {}
) {
    const { viewBox = "0 0 24 24", defaultSize = 24 } = options;

    const Icon = React.forwardRef<SVGSVGElement, IconProps>(
        (
            {
                size = defaultSize,
                color = "currentColor",
                strokeWidth = 1.5,
                title,
                ...props
            },
            ref
        ) => (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox={viewBox}
                fill="none"
                {...props}
            >
                {title ? <title>{title}</title> : null}
                {render({ color, strokeWidth })}
            </svg>
        )
    );

    Icon.displayName = "Icon";
    return Icon;
}
export const CustomControlIcon = createIcon(({ color, strokeWidth }) => (
    <path
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.25 2.75v7a3 3 0 0 0 3 3h1m4-10v7a3 3 0 0 1-3 3h-1m0-10v10m0 0v8.5m13.5 0v-6.5m0 0V3.286a.536.536 0 0 0-.536-.536a4.464 4.464 0 0 0-4.464 4.464v5.536a2 2 0 0 0 2 2z"
    />
));
export const CustomAddSquareIcon = createIcon(({ color, strokeWidth }) => (
    <path
        fill="none"
        stroke={color}
        strokeLinecap="square"
        strokeWidth={strokeWidth}
        d="M21 3H3v18h18zm-9 4.5V12m0 0v4.5m0-4.5h4.5M12 12H7.5"
    />
));

export const foodandsoda = createIcon(({ color, strokeWidth }) => (
    <path fill={color} d="M1 22c0 .54.45 1 1 1h13c.56 0 1-.46 1-1v-1H1zM8.5 9C4.75 9 1 11 1 15h15c0-4-3.75-6-7.5-6m-4.88 4c1.11-1.55 3.47-2 4.88-2s3.77.45 4.88 2zM1 17h15v2H1zM18 5V1h-2v4h-5l.23 2h9.56l-1.4 14H18v2h1.72c.84 0 1.53-.65 1.63-1.47L23 5z" />
), { viewBox: "0 0 24 24" });

export const CustomIcons = {
    Food: CustomControlIcon,
    AddSquare: CustomAddSquareIcon,
    FoodAndSoda: foodandsoda,
} as const;

export type CustomIconName = keyof typeof CustomIcons;

export function resolveCustomIcon(name: string) {
    return (CustomIcons as Record<string, React.ComponentType<IconProps> | undefined>)[name];
}

export function CustomIcon({ name, ...props }: { name: CustomIconName } & IconProps) {
    const Icon = CustomIcons[name];
    return <Icon {...props} />;
}

