// Business category picker data — grouped by industry.
// `icon` on the group refers to a key in the GroupIcon map (used for the group
// label accent); each item now carries its own `icon` key so every tile in the
// grid gets a distinct icon instead of every item in a group sharing one.
export const BUSINESS_CATEGORY_GROUPS = [
  {
    group: 'Retail & E-commerce', icon: 'retail',
    items: [
      { label: 'Clothing and Apparel Store', icon: 'clothing' },
      { label: 'Jewellery and Accessory Boutique', icon: 'jewellery' },
      { label: 'Supermarket and Grocery Store', icon: 'grocery' },
      { label: 'Electronics and Computer Retailer', icon: 'electronics' },
      { label: 'Furniture and Home Goods Store', icon: 'furniture' },
      { label: 'Bookstore and Stationery Shop', icon: 'books' },
      { label: 'Hardware and Building Materials Store', icon: 'hardware' },
      { label: 'Sporting Goods Store', icon: 'sports' },
    ],
  },
  {
    group: 'Health, Wellness & Beauty', icon: 'health',
    items: [
      { label: 'Gym and Fitness Center', icon: 'fitness' },
      { label: 'Hair Salon, Barbershop, and Spa', icon: 'salon' },
      { label: 'Pharmacy and Medical Supply', icon: 'pharmacy' },
      { label: 'General Hospital and Medical Clinic', icon: 'hospital' },
      { label: 'Dental Practice', icon: 'dental' },
      { label: 'Yoga, Pilates, and Dance Studio', icon: 'yoga' },
      { label: 'Physical Therapy and Rehabilitation', icon: 'therapy' },
      { label: 'Mental Health and Counseling Center', icon: 'counseling' },
    ],
  },
  {
    group: 'General Services & Trades', icon: 'services',
    items: [
      { label: 'Commercial and Retail Printing Services', icon: 'printing' },
      { label: 'Dry Cleaning and Laundry Services', icon: 'laundry' },
      { label: 'Automotive Repair and Maintenance', icon: 'auto' },
      { label: 'Plumbing, HVAC, and Electrical Services', icon: 'hvac' },
      { label: 'Home and Commercial Cleaning Services', icon: 'cleaning' },
      { label: 'Tailoring and Alteration Services', icon: 'tailoring' },
      { label: 'Courier and Delivery Logistics', icon: 'delivery' },
      { label: 'Security and Surveillance Services', icon: 'security' },
    ],
  },
  {
    group: 'Food & Beverage', icon: 'food',
    items: [
      { label: 'Restaurant and Fine Dining', icon: 'restaurant' },
      { label: 'Cafe and Coffee Shop', icon: 'cafe' },
      { label: 'Bakery and Confectionery', icon: 'bakery' },
      { label: 'Catering and Event Food Services', icon: 'catering' },
      { label: 'Food Truck and Mobile Kiosk', icon: 'foodtruck' },
      { label: 'Bar, Pub, and Nightclub', icon: 'bar' },
      { label: 'Brewery and Distillery', icon: 'brewery' },
    ],
  },
  {
    group: 'Professional & Corporate Services', icon: 'professional',
    items: [
      { label: 'Graphic Design and Branding Agency', icon: 'design' },
      { label: 'Accounting, Bookkeeping, and Tax Firm', icon: 'accounting' },
      { label: 'Real Estate Agency and Property Management', icon: 'realestate' },
      { label: 'Legal, Law, and Consulting Services', icon: 'legal' },
      { label: 'Architecture and Interior Design Firm', icon: 'architecture' },
      { label: 'Financial Planning and Investment Services', icon: 'finance' },
      { label: 'Insurance Agency', icon: 'insurance' },
    ],
  },
  {
    group: 'Technology & Media', icon: 'tech',
    items: [
      { label: 'Software and Mobile App Development', icon: 'software' },
      { label: 'IT Support and Network Infrastructure', icon: 'network' },
      { label: 'Photography and Videography Studio', icon: 'photography' },
      { label: 'Digital Marketing and SEO Agency', icon: 'marketing' },
      { label: 'Web Hosting and Cloud Services', icon: 'cloud' },
      { label: 'Animation and Motion Graphics Studio', icon: 'animation' },
      { label: 'Broadcasting and Media Production', icon: 'broadcast' },
    ],
  },
  {
    group: 'Education & Childcare', icon: 'education',
    items: [
      { label: 'Tutoring and Test Prep Center', icon: 'tutoring' },
      { label: 'Daycare, Creche, and Preschool', icon: 'daycare' },
      { label: 'Music, Arts, and Language Academy', icon: 'music' },
      { label: 'Vocational and Technical Training Institute', icon: 'vocational' },
      { label: 'Driving School', icon: 'driving' },
      { label: 'Primary and Secondary School', icon: 'school' },
    ],
  },
  {
    group: 'Entertainment, Events & Travel', icon: 'entertainment',
    items: [
      { label: 'Event Management and Wedding Planning', icon: 'events' },
      { label: 'Travel Agency and Tour Operator', icon: 'travel' },
      { label: 'Hotel, Resort, and Accommodation', icon: 'hotel' },
      { label: 'Cinema, Theater, and Performing Arts', icon: 'cinema' },
      { label: 'Arcade, Bowling Alley, and Recreation Center', icon: 'arcade' },
      { label: 'Museum and Art Gallery', icon: 'museum' },
    ],
  },
  {
    group: 'Manufacturing, Agriculture & Wholesale', icon: 'manufacturing',
    items: [
      { label: 'Textile and Garment Manufacturing', icon: 'textile' },
      { label: 'Wholesale Trade and Distribution', icon: 'wholesale' },
      { label: 'Food Processing and Packaging', icon: 'foodprocessing' },
      { label: 'Farming, Agriculture, and Nursery', icon: 'farming' },
      { label: 'Furniture Carpentry and Woodworking', icon: 'carpentry' },
      { label: 'Metal Fabrication and Machining', icon: 'metalwork' },
    ],
  },
];
