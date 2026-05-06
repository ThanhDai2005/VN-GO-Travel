import { useRef, useEffect } from 'react';

/**
 * A wrapper component that adds a synchronized horizontal scrollbar at the top.
 * This is useful for long tables where the bottom scrollbar is not visible without scrolling down.
 */
export default function TableScrollWrapper({ children }) {
  const topScrollRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const content = contentRef.current;

    if (!topScroll || !content) return;

    // Sync top scroll to content
    const handleContentScroll = () => {
      if (topScroll.scrollLeft !== content.scrollLeft) {
        topScroll.scrollLeft = content.scrollLeft;
      }
    };

    // Sync content scroll to top
    const handleTopScroll = () => {
      if (content.scrollLeft !== topScroll.scrollLeft) {
        content.scrollLeft = topScroll.scrollLeft;
      }
    };

    content.addEventListener('scroll', handleContentScroll);
    topScroll.addEventListener('scroll', handleTopScroll);

    // Initial sync of width
    const observer = new ResizeObserver(() => {
      const inner = content.firstChild;
      if (inner) {
        const topInner = topScroll.firstChild;
        if (topInner) {
          topInner.style.width = `${inner.scrollWidth}px`;
        }
      }
    });

    observer.observe(content);
    if (content.firstChild) observer.observe(content.firstChild);

    return () => {
      content.removeEventListener('scroll', handleContentScroll);
      topScroll.removeEventListener('scroll', handleTopScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col w-full overflow-hidden">
      {/* Top Scrollbar Placeholder */}
      <div 
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden h-4 w-full scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ height: '1px' }}></div>
      </div>
      
      {/* Content */}
      <div 
        ref={contentRef}
        className="overflow-x-auto w-full rounded-lg bg-white shadow"
      >
        {children}
      </div>
    </div>
  );
}
