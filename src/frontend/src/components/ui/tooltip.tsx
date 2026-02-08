import React from 'react';

interface TooltipProps {
    children: React.ReactNode;
    content: string;
    side?: 'right' | 'top' | 'bottom' | 'left';
}

export function Tooltip({ children, content, side = 'right' }: TooltipProps) {
    return (
        <div className="group relative flex items-center">
            {children}
            <div className={`
        absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 
        transition-opacity pointer-events-none group-hover:opacity-100 whitespace-nowrap
        ${side === 'right' ? 'left-full ml-2' : ''}
        ${side === 'left' ? 'right-full mr-2' : ''}
        ${side === 'top' ? 'bottom-full mb-2' : ''}
        ${side === 'bottom' ? 'top-full mt-2' : ''}
      `}>
                {content}
            </div>
        </div>
    );
}
